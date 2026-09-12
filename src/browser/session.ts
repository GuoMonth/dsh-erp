import { chromium } from 'playwright'
import type { BrowserContext, Page } from 'playwright'
import { createHash, randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { BrowserError, cleanUrl, inSite, siteUrl } from './contract.js'
import type { BrowserOpen, BrowserStatus, Capture } from './contract.js'
import { scopeKey } from '../storage/contract.js'
import { privateDirectory } from '../storage/paths.js'
import { prepareBrowser } from './resources.js'
import type { BrowserProgress } from './resources.js'
import { readLabels } from './labels.js'
import { loadReadPolicy } from './read-policy.js'
import type { ReadGrant, ReadNavigate } from './read-policy.js'
import { readScm } from '../scm/read.js'
import type { ScmRead } from '../scm/contract.js'
import { navigateRead } from './read-navigation.js'

/** Passive observation and operator-reviewed route IDs. No agent-provided selector, script or navigation URL. */
export class BrowserSession {
  private context: BrowserContext | undefined
  private base: URL | undefined
  private state: BrowserStatus['state'] = 'closed'
  private revision = 0
  private sessionId = ''
  private reason = 'not-open'
  private epoch = 0
  private grantUntil = 0
  private scope: BrowserOpen['scope'] | undefined
  private readGrant: ReadGrant | undefined
  private scmGrant: { remaining: number; until: number; revision: number } | undefined
  private readController: AbortController | undefined
  private readonly inputBinding = `erp_input_${randomUUID().replaceAll('-', '')}`

  constructor(private readonly options: { directory: string; headless?: boolean; sandbox?: boolean; readPolicyFile?: string; prepare?: typeof prepareBrowser; progress?: BrowserProgress }) {}

  status(): BrowserStatus {
    if (this.state === 'observing' && Date.now() >= this.grantUntil) this.pause('observation-grant-expired')
    const pages = this.context?.pages() ?? []
    return { state: this.state, revision: this.revision, sessionId: this.sessionId, reason: this.reason,
      pages: pages.length, pageUrl: pages.length === 1 && this.base && inSite(pages[0]!.url(), this.base) ? cleanUrl(pages[0]!.url()) : '' }
  }
  pause(reason = 'user-takeover'): BrowserStatus {
    this.readGrant = undefined; this.scmGrant = undefined; this.readController?.abort()
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
      this.context = context; this.base = base; this.scope = structuredClone(input.scope); this.sessionId = randomUUID()
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
    this.readGrant = undefined; this.scmGrant = undefined
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
  async scmConnect(input: BrowserOpen, signal: AbortSignal): Promise<BrowserStatus> {
    const base = siteUrl(input.siteUrl)
    if (base.pathname !== '/') throw new BrowserError('SCM_ROOT_URL_REQUIRED')
    await this.open(input, signal)
    try {
      await this.context!.pages()[0]!.goto(new URL('/#/login', base).href, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      signal.throwIfAborted()
      return this.pause('manual-login-required')
    } catch { await this.close(); throw new BrowserError('SCM_LOGIN_PAGE_FAILED') }
  }
  async scmEnable(sessionId: string, revision: number, signal: AbortSignal): Promise<BrowserStatus> {
    const status = await this.resume(sessionId, revision, signal)
    await this.scmToken()
    if (this.revision !== status.revision) throw new BrowserError('BROWSER_STALE_CONFIRMATION')
    this.scmGrant = { remaining: 250, until: this.grantUntil, revision: this.revision }
    this.reason = 'scm-read-queries-enabled'
    return this.status()
  }
  private async scmToken(): Promise<string> {
    const value = await this.page().evaluate(() => {
      try { return JSON.parse(sessionStorage.getItem('v1@CacheToken') || '{}').token } catch { return undefined }
    })
    if (typeof value !== 'string' || value.length < 8 || value.length > 4096 || /[\r\n]/.test(value)) throw new BrowserError('SCM_LOGIN_REQUIRED')
    return value
  }
  async scmRead(input: ScmRead, signal: AbortSignal) {
    const grant = this.scmGrant
    if (!grant || this.status().state !== 'observing' || input.sessionId !== this.sessionId || input.revision !== this.revision || grant.revision !== this.revision || grant.remaining <= 0 || Date.now() >= grant.until) throw new BrowserError('SCM_READ_GRANT_INVALID')
    if (this.readController) throw new BrowserError('BROWSER_BUSY')
    await this.checkLogin(this.page())
    const token = await this.scmToken()
    if (grant !== this.scmGrant || Date.now() >= grant.until) throw new BrowserError('SCM_READ_GRANT_INVALID')
    const controller = new AbortController(); this.readController = controller; grant.remaining--
    const combined = AbortSignal.any([signal, controller.signal, AbortSignal.timeout(Math.max(1, grant.until - Date.now()))])
    try {
      const result = await readScm(this.base!, input, token, combined)
      combined.throwIfAborted()
      if (grant !== this.scmGrant || this.status().state !== 'observing') throw new BrowserError('SCM_READ_INTERRUPTED')
      return result
    } catch (error) { this.pause('scm-read-failed'); throw error }
    finally { this.readController = undefined }
  }
  readPolicy() { return loadReadPolicy(this.options.readPolicyFile) }
  async enableRead(input: Omit<ReadNavigate, 'routeId'>, signal: AbortSignal): Promise<ReadGrant> {
    const view = this.readPolicy()
    if (input.policyDigest !== view.digest) throw new BrowserError('READ_POLICY_CHANGED')
    if (!this.scope || !this.base || scopeKey(this.scope) !== scopeKey(view.policy.scope) || this.base.href !== view.policy.siteUrl) throw new BrowserError('READ_SCOPE_MISMATCH')
    const status = await this.resume(input.sessionId, input.revision, signal)
    this.readGrant = { sessionId: status.sessionId, revision: status.revision, policyDigest: view.digest,
      expiresAt: new Date(this.grantUntil).toISOString(), remaining: 20 }
    return { ...this.readGrant }
  }
  async read(input: ReadNavigate, signal: AbortSignal): Promise<Capture> {
    signal.throwIfAborted()
    const view = this.readPolicy()
    const grant = this.readGrant
    if (this.readController) throw new BrowserError('BROWSER_BUSY')
    if (!grant || grant.sessionId !== this.sessionId || grant.revision !== this.revision || this.status().state !== 'observing' || input.sessionId !== this.sessionId || input.revision !== this.revision
      || input.policyDigest !== view.digest || grant.policyDigest !== view.digest || grant.remaining <= 0
      || Date.now() >= Date.parse(grant.expiresAt)) throw new BrowserError('READ_GRANT_INVALID')
    if (!view.policy.routes.some(route => route.id === input.routeId)) throw new BrowserError('READ_ROUTE_NOT_ALLOWED')
    const page = this.page(); await this.checkLogin(page)
    if (input.revision !== this.revision || this.readGrant !== grant || Date.now() >= Date.parse(grant.expiresAt)) throw new BrowserError('READ_GRANT_INVALID')
    const controller = new AbortController(); this.readController = controller
    const combined = AbortSignal.any([signal, controller.signal, AbortSignal.timeout(Math.max(1, Math.min(12_000, Date.parse(grant.expiresAt) - Date.now())))])
    grant.remaining-- // A failed or cancelled attempt consumes its slot; never retry automatically.
    try {
      const capture = await navigateRead(this.context!, view, input.routeId, input, combined, () => this.pause('human-input'))
      combined.throwIfAborted()
      if (input.revision !== this.revision || this.readGrant !== grant || this.status().state !== 'observing') throw new BrowserError('READ_GRANT_INVALID')
      return capture
    } catch (error) { this.pause('read-failed-requires-confirmation'); throw error }
    finally { this.readController = undefined }
  }
  async close(): Promise<BrowserStatus> {
    this.epoch++; this.pause('closing')
    const context = this.context; this.context = undefined
    try { await context?.close() } finally { this.state = 'closed'; this.reason = 'browser-closed' }
    return this.status()
  }
}
