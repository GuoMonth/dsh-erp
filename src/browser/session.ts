import { chromium } from 'playwright'
import type { BrowserContext, Page, Frame } from 'playwright'
import { createHash, randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { BrowserError, cleanUrl, inSite, siteUrl } from './contract.js'
import type { BrowserOpen, BrowserStatus, Capture } from './contract.js'
import { scopeKey } from '../storage/contract.js'
import { privateDirectory } from '../storage/paths.js'
import { prepareBrowser } from './resources.js'
import type { BrowserProgress } from './resources.js'

/** Fixed observation only. No selector, script, URL navigation or action is accepted from an agent. */
export class BrowserSession {
  private context: BrowserContext | undefined
  private base: URL | undefined
  private state: BrowserStatus['state'] = 'closed'
  private revision = 0
  private sessionId = ''
  private reason = 'not-open'
  private epoch = 0
  private grantUntil = 0
  private readonly inputBinding = `erp_input_${randomUUID().replaceAll('-', '')}`

  constructor(private readonly options: { directory: string; headless?: boolean; sandbox?: boolean; prepare?: typeof prepareBrowser; progress?: BrowserProgress }) {}

  status(): BrowserStatus {
    if (this.state === 'observing' && Date.now() >= this.grantUntil) this.pause('observation-grant-expired')
    const pages = this.context?.pages() ?? []
    return { state: this.state, revision: this.revision, sessionId: this.sessionId, reason: this.reason,
      pages: pages.length, pageUrl: pages.length === 1 && this.base && inSite(pages[0]!.url(), this.base) ? cleanUrl(pages[0]!.url()) : '' }
  }
  pause(reason = 'user-takeover'): BrowserStatus {
    this.revision++; this.reason = reason
    if (this.context) this.state = 'manual'
    return this.status()
  }
  private watch(page: Page): void {
    this.pause('page-opened')
    page.on('framenavigated', () => this.pause('navigation-requires-confirmation'))
    page.on('frameattached', () => this.pause('frame-changed'))
    page.on('framedetached', () => this.pause('frame-changed'))
    page.on('close', () => this.pause('page-closed'))
    page.on('crash', () => this.pause('page-crashed'))
    // Site-created dialogs are for the human. Do not accept them or keep observation enabled.
    page.on('dialog', () => this.pause('dialog-requires-human'))
  }
  async open(input: BrowserOpen, signal: AbortSignal): Promise<BrowserStatus> {
    if (this.context) throw new BrowserError('BROWSER_ALREADY_OPEN')
    const base = siteUrl(input.siteUrl)
    const scope = scopeKey(input.scope)
    const key = createHash('sha256').update(`${base.href}\n${scope}`).digest('hex')
    const profile = privateDirectory(join(this.options.directory, 'browser-profiles', key))
    const epoch = ++this.epoch
    await (this.options.prepare ?? prepareBrowser)(signal, this.options.progress)
    signal.throwIfAborted()
    try {
      this.options.progress?.('launching', 100)
      const context = await chromium.launchPersistentContext(profile, {
        headless: this.options.headless ?? false, channel: 'chromium', timeout: 30_000,
        chromiumSandbox: this.options.sandbox ?? true,
        acceptDownloads: false, serviceWorkers: 'block', ignoreHTTPSErrors: false,
        viewport: null,
      })
      if (signal.aborted || epoch !== this.epoch) { await context.close(); throw new BrowserError('CANCELLED') }
      this.context = context; this.base = base; this.sessionId = randomUUID()
      context.on('close', () => {
        if (this.context !== context) return
        this.context = undefined; this.state = 'closed'; this.reason = 'browser-closed'; this.revision++
      })
      await context.exposeBinding(this.inputBinding, () => { this.pause('human-input') })
      await context.addInitScript(({ binding }) => {
        for (const name of ['pointerdown', 'keydown', 'wheel', 'touchstart']) {
          addEventListener(name, event => {
            if (event.isTrusted) void (globalThis as unknown as Record<string, () => Promise<void>>)[binding]?.()
          }, { capture: true, passive: true })
        }
      }, { binding: this.inputBinding })
      context.on('page', page => this.watch(page))
      for (const page of context.pages()) this.watch(page)
      // The human navigates and logs in. Never restore an observation grant from profile storage.
      this.pause('manual-login-required')
      this.options.progress?.('ready', 100)
      signal.throwIfAborted()
      return this.status()
    } catch (error) {
      await this.close()
      if (error instanceof BrowserError) throw error
      throw new BrowserError(signal.aborted ? 'CANCELLED' : 'BROWSER_LAUNCH_FAILED_CHECK_DISPLAY_AND_RESOURCES')
    }
  }
  private page(): Page {
    const pages = this.context?.pages() ?? []
    if (!this.context) throw new BrowserError('BROWSER_CLOSED')
    if (pages.length !== 1) { this.pause('select-one-page'); throw new BrowserError('BROWSER_REQUIRES_ONE_PAGE') }
    if (!this.base || !inSite(pages[0]!.url(), this.base)) { this.pause('outside-site'); throw new BrowserError('BROWSER_OUTSIDE_SITE') }
    return pages[0]!
  }
  async resume(sessionId: string, revision: number, signal: AbortSignal): Promise<BrowserStatus> {
    signal.throwIfAborted()
    if (sessionId !== this.sessionId || revision !== this.revision) throw new BrowserError('BROWSER_STALE_CONFIRMATION')
    const page = this.page()
    await this.checkLogin(page)
    signal.throwIfAborted()
    if (revision !== this.revision) throw new BrowserError('BROWSER_STALE_CONFIRMATION')
    this.grantUntil = Date.now() + 10 * 60_000
    this.state = 'observing'; this.reason = 'read-only-observation-enabled'; this.revision++
    return this.status()
  }
  private async checkLogin(page: Page): Promise<void> {
    for (const frame of page.frames()) {
      if (!this.base || !inSite(frame.url(), this.base)) continue
      const password = frame.locator('input[type="password"]')
      const count = await password.count()
      for (let i = 0; i < Math.min(count, 20); i++) if (await password.nth(i).isVisible()) {
        this.pause('login-required'); throw new BrowserError('BROWSER_LOGIN_REQUIRED')
      }
    }
  }
  async capture(signal: AbortSignal): Promise<Capture> {
    signal.throwIfAborted()
    if (this.status().state !== 'observing') throw new BrowserError('BROWSER_MANUAL_CONTROL')
    const revision = this.revision
    const page = this.page()
    const url = page.url()
    await this.checkLogin(page)
    const entries: Capture['entries'] = []
    const limitations = new Set<string>(['rendered-labels-only', 'scope-confirmed-by-user-not-verified-by-erp', 'no-input-values-or-business-rows', 'frames-observed-sequentially', 'labels-bounded-to-200-characters'])
    const frames = page.frames()
    if (frames.length > 10) limitations.add('frame-limit')
    let title = ''; let locale = ''
    for (const [frameIndex, frame] of frames.slice(0, 10).entries()) {
      signal.throwIfAborted()
      if (!this.base || !inSite(frame.url(), this.base)) { limitations.add('outside-site-frame-skipped'); continue }
      const result = await readLabels(frame)
      if (frameIndex === 0) { title = result.title; locale = result.locale }
      for (const e of result.entries) entries.push({ ...e, frame: frameIndex, frameUrl: cleanUrl(frame.url()), href: cleanUrl(e.href) })
      for (const limit of result.limitations) limitations.add(limit)
    }
    signal.throwIfAborted()
    if (this.status().state !== 'observing' || revision !== this.revision || page.url() !== url) throw new BrowserError('BROWSER_OBSERVATION_INTERRUPTED')
    return { sessionId: this.sessionId, revision, url: cleanUrl(url), title, locale,
      observedAt: new Date().toISOString(), entries, limitations: [...limitations] }
  }
  async close(): Promise<BrowserStatus> {
    this.epoch++; this.pause('closing')
    const context = this.context; this.context = undefined
    try { await context?.close() } finally { this.state = 'closed'; this.reason = 'browser-closed' }
    return this.status()
  }
}

async function readLabels(frame: Frame): Promise<{ title: string; locale: string; entries: Omit<Capture['entries'][number], 'frame' | 'frameUrl'>[]; limitations: string[] }> {
  // This constant function is the entire page evaluation surface; never interpolate page/model code.
  return frame.evaluate(() => {
    const visible = (element: Element): boolean => {
      if (!element.getClientRects().length) return false
      for (let node: Element | null = element; node; node = node.parentElement) {
        const style = getComputedStyle(node)
        if (node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true' || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false
      }
      return true
    }
    const clean = (s: string) => s.replace(/(?:password|passwd|token|secret|authorization|cookie)\s*[:=]\s*\S+/gi, '[redacted]')
      .replace(/\bBearer\s+\S+/gi, '[redacted]').replace(/[A-Za-z0-9_+\/-]{40,}/g, '[redacted]')
      .replace(/\s+/g, ' ').trim().slice(0, 200)
    const nodes = document.querySelectorAll('nav a,aside a,[role="navigation"] a,button,[role="button"],[role="menuitem"],[role="tab"],h1,h2,h3,label,legend')
    const entries: { index: number; kind: string; text: string; group: string; href: string }[] = []
    const limitations: string[] = []
    if (nodes.length > 5000) limitations.push('scan-limit')
    for (let index = 0; index < Math.min(nodes.length, 5000); index++) {
      const node = nodes[index]!
      if (!visible(node) || node.closest('form:has(input[type="password"]),[data-erp-private]')) continue
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
      const labels: string[] = []
      let part: Node | null; let visited = 0
      while ((part = walker.nextNode()) && visited++ < 200) {
        const parent = part.parentElement
        if (parent && visible(parent) && !parent.closest('input,textarea,select,script,style,[data-erp-private]')) labels.push(part.textContent || '')
      }
      const text = clean(node.getAttribute('aria-label') || labels.join(' '))
      if (!text) continue
      const container = node.closest('nav,aside,[role="navigation"],[role="menu"],[role="group"],[role="tablist"]')
      const group = clean(container?.getAttribute('aria-label') || container?.getAttribute('role') || container?.tagName.toLowerCase() || '')
      entries.push({ index, kind: (node.getAttribute('role') || node.tagName.toLowerCase()).slice(0, 100), text, group, href: node instanceof HTMLAnchorElement ? node.href.slice(0, 2000) : '' })
      if (entries.length === 300) { limitations.push('entry-limit'); break }
    }
    if (Array.from(document.querySelectorAll('*')).slice(0, 5000).some(n => n.shadowRoot)) limitations.push('shadow-roots-not-explored')
    return { title: clean(document.title), locale: clean(document.documentElement.lang), entries, limitations }
  })
}
