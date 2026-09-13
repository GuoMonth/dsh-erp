// Frozen alpha.5 validation baseline only. Never import from production or ship in npm.
import { BrowserError } from '../../../dist/browser/contract.js';
function object(value) { if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BrowserError('SCM_QUERY_SHAPE_CHANGED'); return value; }
function list(data) { const d = object(data); if (!Array.isArray(d.list) || !Number.isSafeInteger(d.total) || Number(d.total) < 0)
    throw new BrowserError('SCM_QUERY_SHAPE_CHANGED'); return { rows: d.list.map(object), total: Number(d.total) }; }
/** Fixed, versioned read capability. No model-generated code is executed. */
export async function traceProduct(read, session, code, maxDocuments, signal) {
    if (!code.trim() || code.length > 120 || !Number.isInteger(maxDocuments) || maxDocuments < 1 || maxDocuments > 100)
        throw new BrowserError('SCM_TRACE_ARGUMENTS');
    const observations = [];
    const query = async (input) => { signal.throwIfAborted(); const r = await read({ sessionId: session.sessionId, revision: session.revision, ...input }, signal); observations.push(r.observationId); return r; };
    const products = await query({ query: 'products', keyword: code, page: 1, limit: 100 });
    const candidates = list(products.data);
    const matches = candidates.rows.filter(x => x.productCode === code);
    if (matches.length !== 1)
        return { capability: 'scm-product-chain-v1', code, found: false, reason: matches.length ? 'ambiguous-product-code' : 'no-exact-product-in-search-window', searchTotal: candidates.total, observations, complete: false };
    const productRow = matches[0];
    if (typeof productRow.id !== 'string')
        throw new BrowserError('SCM_QUERY_SHAPE_CHANGED');
    const productResult = await query({ query: 'product', id: productRow.id });
    const product = object(productResult.data);
    if (product.id !== productRow.id || product.productCode !== code || !Array.isArray(product.skus))
        throw new BrowserError('SCM_PRODUCT_CHANGED');
    const skuIds = new Set(product.skus.map(x => object(x).id));
    if ([...skuIds].some(x => typeof x !== 'string'))
        throw new BrowserError('SCM_SKU_SHAPE_CHANGED');
    const stockResult = await query({ query: 'stock', keyword: code, page: 1, limit: 100 });
    const stockPage = list(stockResult.data);
    const documents = {};
    for (const [plural, singular, number] of [['purchases', 'purchase', 'poNo'], ['sales', 'sale', 'soNo']]) {
        const pageResult = await query({ query: plural, page: 1, limit: maxDocuments });
        const page = list(pageResult.data);
        const matched = [];
        const seen = new Set();
        for (const row of page.rows) {
            if (seen.size >= maxDocuments)
                throw new BrowserError('SCM_PAGE_LIMIT_IGNORED');
            if (typeof row.id !== 'string' || seen.has(row.id))
                throw new BrowserError('SCM_DOCUMENT_ID_INVALID');
            seen.add(row.id);
            const r = await query({ query: singular, id: row.id });
            const detail = object(r.data);
            if (detail.id !== row.id || !Array.isArray(detail.items))
                throw new BrowserError('SCM_DOCUMENT_SHAPE_CHANGED');
            const items = detail.items.map(object).filter(x => skuIds.has(x.skuId));
            if (items.length)
                matched.push({ id: row.id, number: detail[number], status: detail.status, orderDate: detail.orderDate, warehouseId: detail.warehouseId, items, observationId: r.observationId });
        }
        documents[plural] = { totalAtStart: page.total, scanned: seen.size, scanComplete: seen.size === page.total, matched };
    }
    return { capability: 'scm-product-chain-v1', code, found: true, product: productResult.data, stock: { rows: stockPage.rows.filter(x => x.productId === productRow.id), totalAtStart: stockPage.total, scanComplete: stockPage.rows.length === stockPage.total, observationId: stockResult.observationId }, documents, observations,
        limitations: ['Live read sequence, not a transactional snapshot; order data can change between calls', 'Order relations use product SKU IDs. Document status alone does not prove posted/reversed movement; cancelled records can retain historical qtyOut. No stock reconciliation without transaction, return and unit evidence', 'Each order scan is bounded by maxDocuments; incomplete scans cannot establish absence', 'SPU stock balances are shared across SKU/packaging; compare quantities in their stated units'] };
}
