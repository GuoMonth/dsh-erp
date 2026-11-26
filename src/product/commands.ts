import { resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { CommandInvocation } from '@deepseek-ai/dsh-commands'
import type { CommandResult } from '@deepseek-ai/dsh-commands/types'
import type { TakeBrowserObservation } from '../native-learning.js'
import { loggedInUiVisible, startExplore } from '../learning/explore.js'
import { LearningRuntime } from '../learning/runtime.js'
import { sessionHint } from '../sites/router.js'
import type { SessionHint, Site, SiteCatalog } from '../sites/catalog.js'

export const EXPLORE_COMMAND = 'explore'
export const UPDATE_COMMAND = 'explore-update'

const PAUSED = [
  '探索已暂停。登录 ERP 后，在当前会话取得新的原生浏览器快照，再运行 /探索。未完成的范围不会标成完成。',
  'Exploration is paused. Sign in to ERP, take a fresh native browser snapshot in this conversation, then run /explore again. Unfinished scope stays unfinished.',
].join('\n')
const STARTED = [
  '探索已开始。覆盖率只算这一轮。',
  'Exploration has started. Coverage counts this round only.',
].join('\n')
const COMPLETE = [
  '这一轮探索已完成。覆盖率只算这一轮。',
  'This exploration round is complete. Coverage counts this round only.',
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
  const cwd = hint?.cwd
  if (!hint?.id || !cwd) return undefined
  const site = catalog.list().find(item => inWorkspace(item.workspaceDir, cwd))
  if (!site) return undefined
  const selected = catalog.statusSite(hint)
  if (selected && selected.id !== site.id) return undefined
  return site
}

/** Run the depth-3 explore for the conversation's workspace, or refuse when none is selected. */
export async function runExploreCommand(
  catalog: SiteCatalog,
  invocation: Pick<CommandInvocation, 'agent' | 'signal'>,
  replace: boolean,
  takeObservation?: TakeBrowserObservation,
): Promise<CommandResult> {
  invocation.signal.throwIfAborted()
  const hint = sessionHint({ agent: invocation.agent })
  const site = workspaceSite(catalog, hint)
  if (!site) return { kind: 'error', text: NEEDS_WORKSPACE }
  const client = catalog.client(site.id)
  const evidence = takeObservation?.(invocation.agent, site.profile)
  const observation = evidence?.kind === 'snapshot' && loggedInUiVisible(evidence.observation.text)
    ? await client.call('observe', evidence.observation, invocation.signal)
    : undefined
  const outcome = await startExplore(new LearningRuntime(client), site.profile.scope, invocation.signal, observation, replace)
  if (outcome.pausedUntilLogin) {
    const paused = evidence?.kind === 'unsupported-provider'
      ? `探索已暂停。当前浏览器提供方 ${evidence.provider} 没有 ERP 支持的快照工具。请用 erp_native_status 查看。\nExploration is paused. ${evidence.provider} has no ERP snapshot tool. Check erp_native_status.`
      : PAUSED
    return { kind: 'success', text: replace ? `${REPLACED}\n${paused}` : paused }
  }
  const text = outcome.complete ? COMPLETE : STARTED
  return { kind: 'success', text: replace ? `${REPLACED}\n${text}` : text }
}

/** Host slash commands. Names stay ASCII; the desktop contributes the Chinese spellings. */
export function registerErpCommands(ctx: Context, catalog: SiteCatalog, takeObservation?: TakeBrowserObservation): void {
  ctx.inject(['commands'], scope => {
    const { commands } = scope
    const stopExplore = commands.register({
      name: EXPLORE_COMMAND,
      description: 'Explore this ERP site: menu and structure to depth 3. Pauses until the conversation has a fresh browser snapshot of the signed-in site.',
      handler: invocation => runExploreCommand(catalog, invocation, false, takeObservation),
    })
    const stopUpdate = commands.register({
      name: UPDATE_COMMAND,
      description: 'Explore this ERP site again. This round covers the previous explore for this site.',
      handler: invocation => runExploreCommand(catalog, invocation, true, takeObservation),
    })
    scope.effect(() => () => { stopExplore(); stopUpdate() })
  })
}
