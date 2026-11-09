import type { ISessions, SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { IWorkspaces, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { IConversation } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-browser/client'
import type { ISidebarRight } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { UiWorkspace } from '@deepseek-ai/dsh-client-ui-workspace/client'
import { PRODUCT_PANEL } from '../product/names.ts'

export interface OpenSite {
  id: string
  entryUrl: string
  workspaceDir: string
  sessionId?: string
  /** User-facing name. The workspace folder title follows this, not the path basename. */
  name?: string
}

/** `ILayout` publishes selection. The controller still holds the column actions. */
export type LayoutColumns = ILayout & { readonly panels?: { setRightbar(px: number): void } }

export interface OpenDeps {
  sessions: Pick<ISessions, 'binding'>
  uiWorkspace: Pick<UiWorkspace, 'openSession' | 'openWorkspace'>
  layout: LayoutColumns
  sidebar: Pick<ISidebarRight, 'openTab' | 'mounted'>
  workspaces?: IWorkspaces
  conversation?: Pick<IConversation, 'input'>
  bind(siteId: string, sessionId: string): Promise<void>
  /** Called when a first-run draft is prepared, before the composer is shown. */
  hint?(sessionId: string): void
  /** Submit a slash line in the open conversation. */
  submitLine?(sessionId: string, line: string): Promise<void> | void
}

export interface ListedErpSite {
  workspaceDir: string
  entryUrl: string
}

export interface WatchDeps {
  sessions: Pick<ISessions, 'list'>
  sidebar: OpenDeps['sidebar']
  layout: OpenDeps['layout']
  /** Current bookmarks. `undefined` means the list could not be read and the scan should retry. */
  sites(): readonly ListedErpSite[] | Promise<readonly ListedErpSite[] | undefined> | undefined
}

export interface OpenOptions {
  fresh?: boolean
  /** Composer draft. Not sent. */
  prefill?: string
  /** Slash line to run after the conversation is on screen. */
  submit?: string
}

/** About 70% of the chat column plus the browser, leaving the left sidebar out. */
const BROWSER_SHARE = 0.7
const SIDEBAR_DEFAULT = 280
const SIDEBAR_AUTO_COLLAPSE = 1024
let browserWidened = false

/**
 * Register the site folder and name it with the display name.
 * `create` accepts a path and resolves an existing folder. The title is `rename`.
 */
export async function ensureWorkspace(workspaces: OpenDeps['workspaces'], workspaceDir: string, title?: string): Promise<WorkspaceView | undefined> {
  if (!workspaces) return undefined
  let view: WorkspaceView | undefined
  try { view = await workspaces.create({ path: workspaceDir }) }
  catch { view = workspaces.list.getSnapshot().items.find(item => item.path === workspaceDir) }
  const name = title?.trim()
  if (!view || !name || view.title === name) return view
  try { return await workspaces.rename(view.workspaceId, name) }
  catch { return view }
}

/**
 * The host remembers a dragged width in memory. Set the ERP default once per page
 * so a later drag is not pulled back. The frame itself caps the panel at 70% of
 * the viewport and keeps 400px for the conversation.
 */
export function widenErpBrowser(layout: OpenDeps['layout']): void {
  if (browserWidened) return
  const setRightbar = layout.panels?.setRightbar
  if (typeof setRightbar !== 'function' || typeof window === 'undefined') return
  const viewport = window.innerWidth
  if (!Number.isFinite(viewport) || viewport <= 0) return
  const sidebar = viewport < SIDEBAR_AUTO_COLLAPSE ? 0 : SIDEBAR_DEFAULT
  browserWidened = true
  setRightbar(Math.round(Math.max(0, viewport - sidebar) * BROWSER_SHARE))
}

interface BrowserTab {
  id: string
  kind: string
}

interface BrowserTabs {
  tabsIn?(sessionId: string): readonly BrowserTab[]
  tabDomain?: {
    occurrence(sessionId: string, tab: { id: string }): { navigation: { getSnapshot(): { params?: { url?: string } } } }
  }
  focus?(tabId: string): void
}

/** Compare site entries without the query string. A trailing slash does not make a second page. */
function entryKey(url: string): string {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname.replace(/\/+$/, '')
    return `${parsed.origin}${path}/`
  } catch { return url }
}

/**
 * Browser pages are `multiple: true`, so `openTab('browser')` always mints a new tab.
 * The controller can still list the session's tabs and focus one whose opener URL is this entry.
 */
export function revealSiteTab(sidebar: OpenDeps['sidebar'], sessionId: string | undefined, entryUrl: string): void {
  const reader = sidebar as OpenDeps['sidebar'] & BrowserTabs
  const want = entryKey(entryUrl)
  if (sessionId && reader.tabsIn && reader.tabDomain && reader.focus) {
    for (const tab of reader.tabsIn(sessionId)) {
      if (tab.kind !== 'browser') continue
      let current: string | undefined
      try { current = reader.tabDomain.occurrence(sessionId, tab).navigation.getSnapshot().params?.url }
      catch { continue }
      if (current && entryKey(current) === want) {
        reader.focus(tab.id)
        return
      }
    }
  }
  sidebar.openTab('browser', { params: { url: entryUrl } })
}

function waitUntilShown(sidebar: OpenDeps['sidebar'], sessionId: string): Promise<void> {
  const mounted = sidebar.mounted
  if (!mounted) return Promise.resolve()
  if (mounted.getSnapshot() === sessionId) return Promise.resolve()
  return new Promise(resolve => {
    let stop = () => {}
    const timer = setTimeout(() => { stop(); resolve() }, 800)
    stop = mounted.subscribe(() => {
      if (mounted.getSnapshot() === sessionId) { clearTimeout(timer); stop(); resolve() }
    })
  })
}

function placeDraft(deps: OpenDeps, sessionId: string, text: string): void {
  const binding = deps.sessions.binding(sessionId)
  if (!binding) return
  deps.conversation?.input.requestDraftInitialization(binding, { prompt: text, whenDraftExists: 'keep' })
}

function prefillDraft(deps: OpenDeps, sessionId: string, text: string): void {
  deps.hint?.(sessionId)
  placeDraft(deps, sessionId, text)
}

async function focusSession(deps: OpenDeps, site: OpenSite, view: WorkspaceView | undefined, options: OpenOptions | undefined): Promise<string> {
  const member = Boolean(!options?.fresh && site.sessionId && view?.sessionIds.includes(site.sessionId))
  if (member && site.sessionId) {
    deps.uiWorkspace.openSession(site.sessionId)
    if (options?.prefill) prefillDraft(deps, site.sessionId, options.prefill)
    if (options?.submit) placeDraft(deps, site.sessionId, options.submit)
    return site.sessionId
  }
  if (!view) throw new Error('ERP_SESSION_ID')
  let opened = ''
  await deps.uiWorkspace.openWorkspace(view.workspaceId, id => {
    opened = id
    if (options?.prefill) prefillDraft(deps, id, options.prefill)
    if (options?.submit) placeDraft(deps, id, options.submit)
  })
  if (!opened) throw new Error('ERP_SESSION_ID')
  if (opened !== site.sessionId) await deps.bind(site.id, opened)
  return opened
}

function normalizeDir(path: string): string {
  return path.replace(/[\\/]+/g, '/').replace(/\/+$/, '')
}

/** Entry URL when `cwd` is that site's workspace folder. */
export function sessionEntry(sites: readonly ListedErpSite[], cwd: string | undefined): string | undefined {
  if (!cwd) return undefined
  const actual = normalizeDir(cwd)
  return sites.find(site => {
    const root = normalizeDir(site.workspaceDir)
    return actual === root || actual.startsWith(`${root}/`)
  })?.entryUrl
}

/**
 * Open the site entry when a session is created inside that site's workspace.
 * The host has no new-chat plugin hook. `sessions.list` is the catalog, and
 * `sidebar.mounted` is the session on screen. `openTab` only acts on that session,
 * so a new row waits until it is shown. Sessions already listed at startup are left alone.
 * A subagent is not a chat. The 70% width still follows {@link widenErpBrowser}.
 */
export function watchWorkspaceSessions(deps: WatchDeps): () => void {
  const list = deps.sessions.list
  const seen = new Set<string>()
  const pending = new Map<string, string>()
  let seeded = false
  let scanning = false
  let again = false
  let alive = true
  const flush = () => {
    const current = deps.sidebar.mounted?.getSnapshot()
    if (typeof current !== 'string') return
    const url = pending.get(current)
    if (!url) return
    pending.delete(current)
    widenErpBrowser(deps.layout)
    try { revealSiteTab(deps.sidebar, current, url) }
    catch { /* The official browser is not available in this host. */ }
  }
  const scan = async () => {
    if (!alive) return
    if (scanning) { again = true; return }
    scanning = true
    try {
      do {
        again = false
        const snap = list.getSnapshot()
        if (snap.phase !== 'ready') continue
        if (!seeded) {
          for (const id of snap.ids) seen.add(id)
          seeded = true
          continue
        }
        const fresh: string[] = []
        for (const id of snap.ids) {
          if (seen.has(id)) continue
          seen.add(id)
          fresh.push(id)
        }
        if (!fresh.length) continue
        let sites: readonly ListedErpSite[] | undefined
        try { sites = await deps.sites() ?? undefined }
        catch { sites = undefined }
        if (!alive) return
        if (!sites) {
          for (const id of fresh) seen.delete(id)
          continue
        }
        const current: SessionListState['byId'] = list.getSnapshot().byId
        for (const id of fresh) {
          const summary = current[id]
          if (!summary || summary.origin === 'subagent') continue
          const url = sessionEntry(sites, summary.cwd)
          if (url) pending.set(id, url)
        }
        flush()
      } while (again && alive)
    } finally { scanning = false }
  }
  const stopList = list.subscribe(() => { void scan() })
  const stopMounted = deps.sidebar.mounted?.subscribe(flush) ?? (() => {})
  void scan()
  return () => {
    alive = false
    stopList()
    stopMounted()
  }
}

/**
 * Focus this site's conversation, then open its entry URL in the official sidebar Browser.
 * The user signs in there. This function never receives a password.
 * `openWorkspace` attaches the session, so the composer is not left on "Choose a workspace".
 * Continue reopens the bound member. A new chat reuses that folder's blank session.
 */
export async function openErpSite(deps: OpenDeps, site: OpenSite, options?: OpenOptions): Promise<string> {
  if (!deps.sidebar?.openTab) throw new Error('ERP_BROWSER_UNAVAILABLE')
  const view = await ensureWorkspace(deps.workspaces, site.workspaceDir, site.name)
  widenErpBrowser(deps.layout)
  const sessionId = await focusSession(deps, site, view, options)
  deps.layout.selectPanel(null)
  await waitUntilShown(deps.sidebar, sessionId)
  if (options?.submit) await deps.submitLine?.(sessionId, options.submit)
  let opened = false
  let last: unknown
  for (let attempt = 0; attempt < 40 && !opened; attempt += 1) {
    try {
      revealSiteTab(deps.sidebar, sessionId, site.entryUrl)
      opened = true
    } catch (error) {
      last = error
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes('no session surface is mounted')) break
      await new Promise(resolve => { setTimeout(resolve, 100) })
    }
  }
  if (!opened) {
    const detail = last instanceof Error ? last.message : ''
    deps.layout.selectPanel(PRODUCT_PANEL)
    throw new Error(detail.startsWith('ERP_') ? detail : 'ERP_BROWSER_UNAVAILABLE')
  }
  return sessionId
}
