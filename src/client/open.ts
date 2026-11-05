import { PRODUCT_PANEL } from '../product/names.ts'

export interface OpenSite {
  id: string
  entryUrl: string
  workspaceDir: string
  sessionId?: string
  /** User-facing name. The workspace folder title follows this, not the path basename. */
  name?: string
}

export interface WorkspaceRecord {
  workspaceId: string
  path: string
  title: string
  sessionIds?: readonly string[]
}

interface WorkspaceApi {
  create(input: { path: string }): Promise<unknown>
  rename?(workspaceId: string, title: string): Promise<unknown>
  list?: { getSnapshot(): { items?: readonly unknown[] } }
}

export interface OpenDeps {
  sessions: {
    create(input: { cwd?: string; workspaceId?: string }): Promise<string>
    binding?(id: string): unknown
  }
  uiWorkspace: {
    openSession(sessionId: string): void
    openWorkspace?(workspaceId: string, beforeOpen?: (sessionId: string) => void): Promise<void>
  }
  layout: {
    selectPanel(panelId: string | null): void
    panels?: { setRightbar?(px: number): void }
  }
  sidebar: { openTab(kind: 'browser', options: { params: { url: string } }): void; mounted?: { getSnapshot(): unknown; subscribe(listener: () => void): () => void } }
  workspaces?: WorkspaceApi
  conversation?: {
    input?: {
      requestDraftInitialization?(binding: unknown, options: { prompt?: string; whenDraftExists?: 'keep' | 'replace' | 'append' }): unknown
    }
  }
  bind(siteId: string, sessionId: string): Promise<void>
  /** Called when a first-run draft is prepared, before the composer is shown. */
  hint?(sessionId: string): void
  /** Submit a slash line in the open conversation. Absent hosts skip it. */
  submitLine?(sessionId: string, line: string): Promise<void> | void
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

function basename(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '')
  const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  return cut === -1 ? trimmed : trimmed.slice(cut + 1)
}

function asWorkspace(value: unknown): WorkspaceRecord | undefined {
  if (!value || typeof value !== 'object') return undefined
  const nested = 'workspace' in value ? value.workspace : value
  if (!nested || typeof nested !== 'object') return undefined
  const row = nested as { workspaceId?: unknown; path?: unknown; title?: unknown; sessionIds?: unknown }
  if (typeof row.workspaceId !== 'string' || typeof row.path !== 'string') return undefined
  const sessionIds = Array.isArray(row.sessionIds) ? row.sessionIds.filter((id): id is string => typeof id === 'string') : undefined
  return { workspaceId: row.workspaceId, path: row.path, title: typeof row.title === 'string' ? row.title : '', ...(sessionIds ? { sessionIds } : {}) }
}

/**
 * Register the site folder and name it with the display name.
 * `create` only accepts a path, so the hash basename is renamed when `rename` exists.
 */
export async function ensureWorkspace(workspaces: OpenDeps['workspaces'], workspaceDir: string, title?: string): Promise<WorkspaceRecord | undefined> {
  if (!workspaces) return undefined
  let view = asWorkspace(await workspaces.create({ path: workspaceDir }).catch(() => undefined))
  if (!view) {
    const items = workspaces.list?.getSnapshot().items ?? []
    view = items.map(asWorkspace).find(item => item?.path === workspaceDir)
  }
  const name = title?.trim()
  if (!view || !name || view.title === name || !workspaces.rename) return view
  return asWorkspace(await workspaces.rename(view.workspaceId, name).catch(() => undefined)) ?? view
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

function prefillDraft(deps: OpenDeps, sessionId: string, text: string): void {
  deps.hint?.(sessionId)
  const binding = deps.sessions.binding?.(sessionId)
  if (!binding) return
  deps.conversation?.input?.requestDraftInitialization?.(binding, { prompt: text, whenDraftExists: 'keep' })
}

async function focusSession(deps: OpenDeps, site: OpenSite, view: WorkspaceRecord | undefined, options: OpenOptions | undefined): Promise<string> {
  const member = Boolean(site.sessionId && view?.sessionIds?.includes(site.sessionId))
  if (!options?.fresh && member && site.sessionId) {
    deps.uiWorkspace.openSession(site.sessionId)
    if (options?.prefill) prefillDraft(deps, site.sessionId, options.prefill)
    return site.sessionId
  }
  if (view && deps.uiWorkspace.openWorkspace) {
    let opened = ''
    await deps.uiWorkspace.openWorkspace(view.workspaceId, id => {
      opened = id
      if (options?.prefill) prefillDraft(deps, id, options.prefill)
    })
    if (!opened) throw new Error('ERP_SESSION_ID')
    if (opened !== site.sessionId) await deps.bind(site.id, opened)
    return opened
  }
  let sessionId = options?.fresh ? undefined : site.sessionId
  const create = () => deps.sessions.create(view ? { workspaceId: view.workspaceId } : { cwd: site.workspaceDir })
  if (!sessionId) {
    sessionId = await create()
    await deps.bind(site.id, sessionId)
  }
  try { deps.uiWorkspace.openSession(sessionId) }
  catch {
    await ensureWorkspace(deps.workspaces, site.workspaceDir, site.name)
    sessionId = await create()
    await deps.bind(site.id, sessionId)
    deps.uiWorkspace.openSession(sessionId)
  }
  if (options?.prefill) prefillDraft(deps, sessionId, options.prefill)
  return sessionId
}

/**
 * Focus this site's conversation, then open its entry URL in the official sidebar Browser.
 * The user signs in there. This function never receives a password.
 * A returned workspace id is opened with `openWorkspace`, which attaches the session
 * so the composer selector shows that folder. `sessions.create({ cwd })` does not.
 */
export async function openErpSite(deps: OpenDeps, site: OpenSite, options?: OpenOptions): Promise<string> {
  if (!deps.sidebar?.openTab) throw new Error('ERP_BROWSER_UNAVAILABLE')
  const view = await ensureWorkspace(deps.workspaces, site.workspaceDir, site.name)
  widenErpBrowser(deps.layout)
  const sessionId = await focusSession(deps, site, view, options)
  deps.layout.selectPanel(null)
  await waitUntilShown(deps.sidebar, sessionId)
  if (options?.submit) await deps.submitLine?.(sessionId, options.submit)
  try { deps.sidebar.openTab('browser', { params: { url: site.entryUrl } }) }
  catch (error) {
    deps.layout.selectPanel(PRODUCT_PANEL)
    throw error
  }
  return sessionId
}
