import { PRODUCT_PANEL } from '../product/names.ts'

export interface OpenSite {
  id: string
  entryUrl: string
  workspaceDir: string
  sessionId?: string
}

export interface OpenDeps {
  sessions: { create(input: { cwd: string }): Promise<string> }
  uiWorkspace: { openSession(sessionId: string): void }
  layout: { selectPanel(panelId: string | null): void }
  sidebar: { openTab(kind: 'browser', options: { params: { url: string } }): void; mounted?: { getSnapshot(): unknown; subscribe(listener: () => void): () => void } }
  workspaces?: { create(input: { path: string }): Promise<unknown> }
  bind(siteId: string, sessionId: string): Promise<void>
}

/** Register the site folder with the host workspace service when that service is injected. */
export async function ensureWorkspace(workspaces: OpenDeps['workspaces'], workspaceDir: string): Promise<void> {
  if (!workspaces) return
  await workspaces.create({ path: workspaceDir }).catch(() => undefined)
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

/**
 * Focus this site's conversation, then open its entry URL in the official sidebar Browser.
 * The user signs in there. This function never receives a password.
 * `workspaces.create({ path })` registers the folder. `sessions.create({ cwd })` adds a
 * conversation; the host groups those conversations by that canonical cwd.
 * `fresh` starts another conversation in the same folder. Switching among them is the host workspace list.
 */
export async function openErpSite(deps: OpenDeps, site: OpenSite, options?: { fresh?: boolean }): Promise<string> {
  if (!deps.sidebar?.openTab) throw new Error('ERP_BROWSER_UNAVAILABLE')
  await ensureWorkspace(deps.workspaces, site.workspaceDir)
  let sessionId = options?.fresh ? undefined : site.sessionId
  if (!sessionId) {
    sessionId = await deps.sessions.create({ cwd: site.workspaceDir })
    await deps.bind(site.id, sessionId)
  }
  try { deps.uiWorkspace.openSession(sessionId) }
  catch {
    await ensureWorkspace(deps.workspaces, site.workspaceDir)
    sessionId = await deps.sessions.create({ cwd: site.workspaceDir })
    await deps.bind(site.id, sessionId)
    deps.uiWorkspace.openSession(sessionId)
  }
  deps.layout.selectPanel(null)
  await waitUntilShown(deps.sidebar, sessionId)
  try { deps.sidebar.openTab('browser', { params: { url: site.entryUrl } }) }
  catch (error) {
    deps.layout.selectPanel(PRODUCT_PANEL)
    throw error
  }
  return sessionId
}
