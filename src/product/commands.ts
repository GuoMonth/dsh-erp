import { resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { startExplore } from '../learning/explore.js'
import { LearningRuntime } from '../learning/runtime.js'
import { sessionHint } from '../sites/router.js'
import type { SessionHint, Site, SiteCatalog } from '../sites/catalog.js'

export const EXPLORE_COMMAND = 'explore'
export const UPDATE_COMMAND = 'explore-update'

interface CommandResult { kind: 'success' | 'error'; text?: string }
interface CommandInvocation { agent: { session?: unknown }; signal: AbortSignal }

const PAUSED = [
  '还看不到已登录界面，探索已暂停。请先在右侧浏览器登录，然后再发送。未完成的范围不会标成完成。',
  'The logged-in page is not visible yet, so exploration is paused. Sign in on the right, then send this again. Unfinished scope stays unfinished.',
].join('\n')
const STARTED = [
  '探索已开始。覆盖率只算这一轮。',
  'Exploration has started. Coverage counts this round only.',
].join('\n')
const REPLACED = [
  '这一轮会覆盖该站点上一次探索。已有索引还在这个工作区里。',
  'This round covers the previous explore for this site. The index already in this workspace stays.',
].join('\n')
const NEEDS_WORKSPACE = [
  '请先选择这个站点的工作区，再探索。',
  'Choose this site\'s workspace before exploring.',
].join('\n')

function inWorkspace(workspace: string, cwd: string): boolean {
  const root = resolve(workspace)
  const actual = resolve(cwd)
  return actual === root || actual.startsWith(root.endsWith(sep) ? root : root + sep)
}

/** The site whose workspace folder this conversation is already inside. */
export function workspaceSite(catalog: SiteCatalog, hint: SessionHint | undefined): Site | undefined {
  if (!hint?.id || !hint.cwd) return undefined
  const site = catalog.list().find(item => inWorkspace(item.workspaceDir, hint.cwd!))
  if (!site) return undefined
  const selected = catalog.statusSite(hint)
  if (selected && selected.id !== site.id) return undefined
  return site
}

/** Run the depth-3 explore for the conversation's workspace, or refuse when none is selected. */
export async function runExploreCommand(catalog: SiteCatalog, invocation: CommandInvocation, replace: boolean): Promise<CommandResult> {
  const hint = sessionHint({ agent: invocation.agent })
  const site = workspaceSite(catalog, hint)
  if (!site) return { kind: 'error', text: NEEDS_WORKSPACE }
  const outcome = await startExplore(new LearningRuntime(catalog.client(site.id)), site.profile.scope, invocation.signal, undefined, replace)
  if (outcome.pausedUntilLogin) return { kind: 'success', text: replace ? `${REPLACED}\n${PAUSED}` : PAUSED }
  return { kind: 'success', text: replace ? REPLACED : STARTED }
}

/** Host slash commands. Names stay ASCII; the desktop contributes the Chinese spellings. */
export function registerErpCommands(ctx: Context, catalog: SiteCatalog): void {
  ctx.inject(['commands'], scope => {
    const commands = (scope as Context & { commands: { register(definition: {
      name: string
      description: string
      handler(invocation: CommandInvocation): Promise<CommandResult>
    }): () => void } }).commands
    const stopExplore = commands.register({
      name: EXPLORE_COMMAND,
      description: 'Explore this ERP site: menu and structure to depth 3. Pauses when the logged-in page is not visible.',
      handler: invocation => runExploreCommand(catalog, invocation, false),
    })
    const stopUpdate = commands.register({
      name: UPDATE_COMMAND,
      description: 'Explore this ERP site again. This round covers the previous explore for this site.',
      handler: invocation => runExploreCommand(catalog, invocation, true),
    })
    scope.effect(() => () => { stopExplore(); stopUpdate() })
  })
}
