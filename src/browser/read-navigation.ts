import type { BrowserContext, Page } from 'playwright'
import { BrowserError, cleanUrl, inSite } from './contract.js'
import type { Capture } from './contract.js'
import type { ReadPolicyView } from './read-policy.js'
import { requestUrl } from './read-policy.js'
import { readLabels } from './labels.js'

/** Fresh context per read. No deferred page code, cookies or pending autosave return to the manual profile. */
export async function navigateRead(source: BrowserContext, view: ReadPolicyView, routeId: string,
  identity: { sessionId: string; revision: number }, signal: AbortSignal, onInput: () => void): Promise<Capture> {
  const route = view.policy.routes.find(route => route.id === routeId)
  if (!route) throw new BrowserError('READ_ROUTE_NOT_ALLOWED')
  const browser = source.browser()
  if (!browser) throw new BrowserError('READ_CONTEXT_UNAVAILABLE')
  const base = new URL(view.policy.siteUrl)
  signal.throwIfAborted()
  const state = await source.storageState()
  signal.throwIfAborted()
  const context = await browser.newContext({ storageState: {
    cookies: state.cookies.filter(cookie => base.hostname === cookie.domain.replace(/^\./, '') || (cookie.domain.startsWith('.') && base.hostname.endsWith(cookie.domain))),
    origins: state.origins.filter(origin => origin.origin === base.origin),
  }, serviceWorkers: 'block', acceptDownloads: false, ignoreHTTPSErrors: false })
  let failure: string | undefined; let closing: Promise<void> | undefined; let count = 0; let navigationEpoch = 0
  const close = () => closing ??= context.close().catch(() => {})
  const reject = (code: string) => { failure ??= code; void close() }
  const abort = () => reject('CANCELLED')
  signal.addEventListener('abort', abort, { once: true })
  try {
    signal.throwIfAborted()
    await context.routeWebSocket('**/*', socket => { reject('READ_WEBSOCKET_BLOCKED'); socket.close() })
    await context.route('**/*', async intercepted => {
      try {
        if (signal.aborted || failure) { await intercepted.abort(); return }
        const request = intercepted.request()
        const allowed = view.policy.requests.find(rule => route.requests.includes(rule.id)
          && rule.url === requestUrl(request.url()) && rule.method === request.method() && rule.body === (request.postData() ?? ''))
        if (!allowed || ++count > 200) { await intercepted.abort(); reject(allowed ? 'READ_REQUEST_BUDGET' : 'READ_REQUEST_BLOCKED'); return }
        // Do not forward page-controlled method overrides, bearer headers, redirects or automatic retries.
        const cookies = await context.cookies(allowed.url)
        const headers: Record<string, string> = { accept: '*/*', cookie: cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ') }
        if (allowed.contentType) headers['content-type'] = allowed.contentType
        if (signal.aborted || failure) { await intercepted.abort(); return }
        const response = await intercepted.fetch({ headers, maxRedirects: 0, maxRetries: 0, timeout: 8000 })
        if (response.status() < 200 || response.status() >= 300) {
          await intercepted.abort(); reject(response.status() >= 300 && response.status() < 400 ? 'READ_REDIRECT_BLOCKED' : 'READ_HTTP_ERROR'); return
        }
        if (signal.aborted || failure) { await intercepted.abort(); return }
        const responseHeaders = response.headers()
        // Enforced by Chromium before page code starts, including blob/shared workers and form submissions.
        const restrictions = "worker-src 'none'; object-src 'none'; form-action 'none'"
        responseHeaders['content-security-policy'] = responseHeaders['content-security-policy'] ? `${responseHeaders['content-security-policy']}, ${restrictions}` : restrictions
        await intercepted.fulfill({ response, headers: responseHeaders })
      } catch { if (!failure) reject(signal.aborted ? 'CANCELLED' : 'READ_REQUEST_FAILED') }
    })
    await context.exposeBinding('erp_read_input', () => { onInput(); reject('READ_HUMAN_INPUT') })
    await context.addInitScript(() => {
      for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart']) addEventListener(type, event => {
        if (event.isTrusted) void (globalThis as unknown as { erp_read_input(): Promise<void> }).erp_read_input()
      }, { capture: true, passive: true })
    })
    let page: Page | undefined
    context.on('page', opened => {
      if (page) { reject('READ_POPUP_BLOCKED'); return }
      page = opened
      opened.on('framenavigated', () => { navigationEpoch++ })
      opened.on('frameattached', () => { navigationEpoch++ })
      opened.on('framedetached', () => { navigationEpoch++ })
      opened.on('dialog', () => reject('READ_DIALOG_BLOCKED'))
      opened.on('download', () => reject('READ_DOWNLOAD_BLOCKED'))
      opened.on('crash', () => reject('READ_PAGE_CRASHED'))
      // Defense in depth if a worker appears despite the response CSP.
      opened.on('worker', () => reject('READ_WORKER_BLOCKED'))
    })
    const target = await interruptible(context.newPage(), signal)
    await target.goto(route.url, { waitUntil: 'networkidle', timeout: 10_000 })
    if (target.url() !== route.url) throw new BrowserError('READ_LOCATION_CHANGED')
    const captureEpoch = navigationEpoch
    const entries: Capture['entries'] = []; let title = ''; let locale = ''
    const limitations = new Set(['rendered-labels-only', 'fresh-context-no-state-merge', 'scope-confirmed-by-user-not-verified-by-erp',
      'trusted-read-contract-not-automatic-side-effect-detection', `read-policy:${view.digest}`, `read-route:${route.id}`, 'network-quiet-is-not-business-completion',
      'workers-forms-and-plugins-disabled', 'request-headers-restricted', 'indexeddb-and-sessionstorage-not-copied'])
    const frames = target.frames()
    if (frames.length > 10) limitations.add('frame-limit')
    for (const [index, frame] of frames.slice(0, 10).entries()) {
      if (!inSite(frame.url(), base)) { limitations.add('outside-site-frame-skipped'); continue }
      const labels = await readLabels(frame)
      if (!index) { title = labels.title; locale = labels.locale }
      for (const entry of labels.entries) entries.push({ ...entry, frame: index, frameUrl: cleanUrl(frame.url()), href: cleanUrl(entry.href) })
      labels.limitations.forEach(value => limitations.add(value))
      const passwords = frame.locator('input[type="password"]')
      for (let i = 0; i < Math.min(await passwords.count(), 20); i++) if (await passwords.nth(i).isVisible()) throw new BrowserError('BROWSER_LOGIN_REQUIRED')
    }
    if (target.url() !== route.url) throw new BrowserError('READ_LOCATION_CHANGED')
    if (navigationEpoch !== captureEpoch) throw new BrowserError('READ_OBSERVATION_INTERRUPTED')
    const capture: Capture = { sessionId: identity.sessionId, revision: identity.revision, url: cleanUrl(route.url), title, locale, observedAt: new Date().toISOString(), entries, limitations: [...limitations] }
    await close()
    signal.throwIfAborted()
    if (failure) throw new BrowserError(failure)
    return capture
  } catch (error) {
    throw new BrowserError(failure ?? (signal.aborted ? 'CANCELLED' : error instanceof BrowserError ? error.code : 'READ_NAVIGATION_FAILED'))
  } finally { signal.removeEventListener('abort', abort); await close() }
}

// Chromium may close a context during newPage without settling that command promptly.
// Race caller cancellation, then await context.close in the owner before returning.
async function interruptible<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  let rejectAbort: (() => void) | undefined
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = () => reject(new BrowserError('CANCELLED'))
    if (signal.aborted) rejectAbort()
    else signal.addEventListener('abort', rejectAbort, { once: true })
  })
  try { return await Promise.race([task, aborted]) }
  finally { if (rejectAbort) signal.removeEventListener('abort', rejectAbort) }
}
