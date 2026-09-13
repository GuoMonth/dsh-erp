// Frozen alpha.5 validation baseline only. Never import from production or ship in npm.
import { BrowserError } from '../../../dist/browser/contract.js';
/** A small, reviewed integration, not a rule that arbitrary GET requests are safe. */
export function requestFor(base, input) {
    const page = input.page ?? 1, limit = input.limit ?? 20;
    if (!Number.isSafeInteger(page) || page < 1 || page > 1000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100 || (input.keyword?.length ?? 0) > 120)
        throw new BrowserError('SCM_INVALID_QUERY');
    const details = { product: '/usa-pms/product/', purchase: '/usa-pur/order/', sale: '/usa-sale/order/' };
    let path;
    if (input.query in details) {
        if (!/^[1-9][0-9]{0,24}$/.test(input.id ?? '') || input.keyword !== undefined || input.page !== undefined || input.limit !== undefined)
            throw new BrowserError('SCM_INVALID_DETAIL');
        path = details[input.query] + input.id + (input.query === 'product' ? '/workbench' : '');
    }
    else {
        if (input.id !== undefined)
            throw new BrowserError('SCM_UNEXPECTED_ID');
        const paths = { menu: '/sys/menu/nav', products: '/usa-pms/product/page', stock: '/usa-inv/query/stock/page', purchases: '/usa-pur/order/page', sales: '/usa-sale/order/page', transactions: '/usa-inv/query/transaction/page' };
        path = paths[input.query];
        if (!path)
            throw new BrowserError('SCM_UNKNOWN_QUERY');
    }
    const url = new URL('/api/loveinway-admin' + path, base);
    if (['products', 'stock', 'purchases', 'sales', 'transactions'].includes(input.query)) {
        url.searchParams.set('page', String(page));
        url.searchParams.set('limit', String(limit));
        const filter = input.query === 'purchases' ? 'poNo' : input.query === 'sales' ? 'soNo' : 'keyword';
        url.searchParams.set(filter, input.keyword ?? '');
        if (input.query === 'stock')
            url.searchParams.set('positiveOnly', '0');
    }
    else if (input.query === 'menu' && (input.keyword !== undefined || input.page !== undefined || input.limit !== undefined))
        throw new BrowserError('SCM_INVALID_MENU_QUERY');
    return url;
}
// Bound and remove credential-shaped fields before anything crosses the IPC/model boundary.
export function scrub(value, depth = 0) {
    if (depth > 30)
        throw new BrowserError('SCM_RESPONSE_DEPTH');
    if (Array.isArray(value))
        return value.map(x => scrub(x, depth + 1));
    if (value && typeof value === 'object')
        return Object.fromEntries(Object.entries(value).filter(([key]) => !/password|passwd|token|secret|authorization|cookie|phone|email|fax|street|zip|billing|shippingAddress|specialInstructions/i.test(key)).map(([key, v]) => [key, scrub(v, depth + 1)]));
    if (typeof value === 'string')
        return value.replace(/\bBearer\s+\S+/gi, '[redacted]').replace(/\bsk-[a-zA-Z0-9_-]{16,}/g, '[redacted]');
    return value;
}
export async function readScm(base, input, token, signal) {
    const url = requestFor(base, input);
    signal.throwIfAborted();
    let response;
    try {
        response = await fetch(url, { method: 'GET', headers: { token, languageCode: 'en-US', accept: 'application/json' }, redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]) });
    }
    catch {
        throw new BrowserError(signal.aborted ? 'CANCELLED' : 'SCM_READ_TRANSPORT');
    }
    if (!response.ok) {
        await response.body?.cancel();
        throw new BrowserError(`SCM_HTTP_${response.status}`);
    }
    const reader = response.body?.getReader();
    if (!reader)
        throw new BrowserError('SCM_EMPTY_RESPONSE');
    const chunks = [];
    let size = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            size += value.length;
            if (size > 1_000_000)
                throw new BrowserError('SCM_RESPONSE_LIMIT');
            chunks.push(value);
        }
    }
    finally {
        await reader.cancel().catch(() => { });
    }
    signal.throwIfAborted();
    let body;
    try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8').replaceAll(token, '[redacted]'));
    }
    catch {
        throw new BrowserError('SCM_INVALID_JSON');
    }
    if (body.code !== 0 || body.data === undefined)
        throw new BrowserError(body.code === 401 ? 'SCM_LOGIN_REQUIRED' : 'SCM_APPLICATION_ERROR');
    let data = scrub(body.data);
    if (input.query === 'menu') {
        let count = 0;
        const menus = (rows, depth = 0) => {
            if (!Array.isArray(rows) || depth > 8)
                throw new BrowserError('SCM_MENU_SHAPE');
            return rows.map(row => {
                if (++count > 2000 || !row || typeof row.id !== 'string' || !Array.isArray(row.children))
                    throw new BrowserError('SCM_MENU_SHAPE');
                return { id: row.id, name: typeof row.name === 'string' ? row.name : '', url: typeof row.url === 'string' ? row.url : '', children: menus(row.children, depth + 1) };
            });
        };
        data = menus(data);
    }
    return { query: input.query, url: url.href, observedAt: new Date().toISOString(), data: data,
        limitations: ['scm-usa-read-v1: reviewed API data, not rendered page evidence', 'Current account scope only; live data can change between calls', ...(input.query === 'menu' ? ['Menu response is discovery; names can be missing and pages have not all been visited'] : []), ...(['purchases', 'sales'].includes(input.query) ? ['keyword filters document number, not product; join product workbench skus[].id to detail items[].skuId; report scan bounds'] : []), ...(input.query === 'stock' ? ['Balances are shared at SPU level; do not sum the same balance once per SKU'] : [])] };
}
