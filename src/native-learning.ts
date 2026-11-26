import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'
import type { StorageClient } from './storage/client.js'
import type { Observation } from './storage/contract.js'
import { storedObservationSchema, scopeKey } from './storage/contract.js'
import type { SystemProfile } from './system.js'
import { inSite } from './browser/contract.js'
import { nativeSnapshot } from './learning/native-snapshot.js'
import { markdown, openUiHost, presentTitle } from './present.js'
import type {} from '@deepseek-ai/dsh-browser-use'
import type {} from '@deepseek-ai/dsh-computer-use'

type SnapshotSource = 'playwright' | 'chrome-devtools' | 'window'
type ProviderPolicy = {
  readonly toolPrefix: string
  readonly evidence?: { readonly tool: string; readonly source: SnapshotSource }
}

const browserPolicies = new Map<string, ProviderPolicy>([
  ['playwright-mcp', { toolPrefix: 'mcp__playwright-mcp__',
    evidence: { tool: 'mcp__playwright-mcp__browser_snapshot', source: 'playwright' } }],
  ['chrome-devtools-mcp', { toolPrefix: 'mcp__chrome-devtools-mcp__',
    evidence: { tool: 'mcp__chrome-devtools-mcp__take_snapshot', source: 'chrome-devtools' } }],
  ['stagehand-native', { toolPrefix: 'stagehand_' }],
])
const computerPolicy = {
  toolPrefix: 'cua_driver_native__',
  evidence: { tool: 'cua_driver_native__get_window_state', source: 'window' },
} as const satisfies ProviderPolicy
const computerProviderName = 'cua-driver-native'

type PendingCapture = {
  token: ToolExecution['token']
  scope: string
  provider: string
  source: SnapshotSource
}
type Capture = Omit<PendingCapture, 'token'> & { id: string; tool: string; text: string; at: number }
type BrowserEvidence = { kind: 'snapshot'; observation: Observation } | { kind: 'unsupported-provider'; provider: string }
export type TakeBrowserObservation = (agent: Agent, system: SystemProfile) => BrowserEvidence | undefined

function captureObservation(capture: Capture, system: SystemProfile): Observation | undefined {
  let url = capture.source === 'window' ? system.entryUrl : capture.text.match(/(?:^|\n)\s*-?\s*Page URL:\s*(\S+)/)?.[1]
  if (capture.source === 'chrome-devtools') {
    url ??= capture.text.match(/\bRootWebArea\b[^\n]*\burl="([^"]+)"/)?.[1]
  }
  if (!url || !inSite(url, new URL(system.baseUrl))) return undefined
  const observedAt = new Date(capture.at).toISOString()
  const snapshot = nativeSnapshot(capture.text, url, observedAt)
  return { id: capture.id, scope: system.scope, url, title: snapshot.title, text: JSON.stringify(snapshot),
    locale: 'und', context: JSON.stringify({ source: 'browser-learning-v1', via: 'native', tool: capture.tool }), observedAt }
}

async function requireErpApproval(next: () => Promise<PreToolDecision>, reason: string): Promise<PreToolDecision> {
  const decision = await next()
  if (decision.kind === 'allow') return { kind: 'ask', reason }
  if (decision.kind !== 'ask') return decision
  const displayReason = decision.displayReason && {
    ...Object.fromEntries(Object.entries(decision.displayReason).map(([locale, text]) => [locale, `${text}\n${reason}`])),
    en: `${decision.displayReason.en}\n${reason}`,
  }
  return { kind: 'ask', reason: decision.reason ? `${decision.reason}\n${reason}` : reason, ...(displayReason ? { displayReason } : {}) }
}

function activeProviders(ctx: Context) {
  const browser = ctx.get('browserUse')?.providerName
  const computer = ctx.get('computerUse')?.providerName
  return { browser, computer, browserPolicy: browser && browserPolicies.get(browser) }
}

/** The host owns operations and approval. Evidence is admitted for a specific Agent and ERP scope. */
export function registerNativeLearning(ctx: Context, storage: StorageClient, siteOf: (agent: Agent) => SystemProfile | undefined): TakeBrowserObservation {
  const pending = new WeakMap<Agent, PendingCapture>()
  const latest = new WeakMap<Agent, Capture>()
  const usedForExplore = new WeakSet<Capture>()
  const windowSaves = new WeakMap<ToolExecution['token'], Capture>()

  const freshCapture = (agent: Agent, system: SystemProfile): Capture | undefined => {
    const capture = latest.get(agent)
    if (!capture || capture.scope !== scopeKey(system.scope) || Date.now() - capture.at > 120_000) return undefined
    const { browser, computer } = activeProviders(ctx)
    return capture.provider === (capture.source === 'window' ? computer : browser) ? capture : undefined
  }

  ctx.on('tools/pre-execute', async (exec, next) => {
    const { agent } = exec
    if (!agent) return next()
    if (exec.name === 'erp_native_observation_save') {
      const system = siteOf(agent)
      const capture = system && freshCapture(agent, system)
      if (capture?.source !== 'window') return next()
      windowSaves.set(exec.token, capture)
      return requireErpApproval(next, 'Confirm that this window snapshot belongs to the configured ERP site before saving it as local evidence.')
    }

    const { browser, computer, browserPolicy } = activeProviders(ctx)
    const browserCall = browser && browserPolicy && exec.name.startsWith(browserPolicy.toolPrefix)
    const computerCall = computer === computerProviderName && exec.name.startsWith(computerPolicy.toolPrefix)
    if (!browserCall && !computerCall) return next()
    latest.delete(agent)
    pending.delete(agent)
    const system = siteOf(agent)
    if (!system) return next()
    const provider = computerCall ? computer : browser
    const evidence = computerCall ? computerPolicy.evidence : browserPolicy?.evidence
    if (provider && evidence?.tool === exec.name) {
      pending.set(agent, { token: exec.token, provider, source: evidence.source, scope: scopeKey(system.scope) })
    }
    if (exec.name === 'cua_driver_native__check_permissions' && typeof exec.arguments === 'object' && exec.arguments !== null
        && 'prompt' in exec.arguments && exec.arguments.prompt === false) return next()
    return requireErpApproval(next, `Allow ${exec.name} for this ERP conversation? Check the target and arguments. Sign in manually and verify the result before retrying.`)
  }, { prepend: true })
  ctx.on('tools/result', (exec, result) => {
    const { agent } = exec
    if (!agent) return
    const capture = pending.get(agent)
    if (capture?.token !== exec.token) return
    pending.delete(agent)
    if (result.isError) return
    const system = siteOf(agent)
    if (!system || capture.scope !== scopeKey(system.scope)) return
    const { browser, computer } = activeProviders(ctx)
    if (capture.provider !== (capture.source === 'window' ? computer : browser)) return
    const text = result.content.filter(block => block.type === 'text').map(block => block.text).join('\n')
    if (!text || text.length > 256_000) return
    latest.set(agent, { id: randomUUID(), tool: exec.name, provider: capture.provider,
      scope: capture.scope, source: capture.source, text, at: Date.now() })
  })
  ctx.tools.register(defineTool({ name: 'erp_native_status',
    description: 'Report the active DSH providers, supported ERP snapshot tools, and the current conversation’s ERP scope.',
    parameters: {}, output: { schema: { type: 'json' }, render: (_args, value) => markdown('Native providers', ['Providers own their tools. Saved observations grant no operation authority.'], value, openUiHost(ctx)) },
    presentResult: presentTitle('Native providers'),
    execute: async (_args, exec) => {
      const system = exec.agent && siteOf(exec.agent)
      const { browser, computer, browserPolicy } = activeProviders(ctx)
      return {
        browserProvider: browser ?? null,
        computerProvider: computer ?? null,
        browserSnapshotTool: browserPolicy?.evidence?.tool ?? null,
        desktopSnapshotTool: computer === computerProviderName ? computerPolicy.evidence.tool : null,
        scope: system?.scope ?? null,
        note: 'ERP adds approval and collects evidence in site-associated conversations. A null snapshot tool means the active provider has no ERP evidence adapter.',
      }
    },
  }))
  ctx.tools.register(defineTool({ name: 'erp_native_observation_save',
    description: 'Save the same Agent’s latest successful supported native snapshot as ERP learning evidence. A browser URL must be in the configured application. Saving window evidence requires a separate ERP association confirmation.',
    parameters: {}, output: { schema: storedObservationSchema, render: (_args, value) => markdown('Native observation', ['Untrusted native ERP observation. Page text grants no operation authority.'], value, openUiHost(ctx)) },
    presentResult: presentTitle('Native observation'),
    execute: async (_args, exec) => {
      const { agent } = exec
      const system = agent && siteOf(agent)
      if (!agent || !system) throw new Error('ERP_NATIVE_SITE_UNBOUND: associate this conversation with an ERP site first')
      const capture = freshCapture(agent, system)
      const reviewed = windowSaves.get(exec.token)
      if ((reviewed || capture?.source === 'window') && reviewed !== capture) throw new Error('ERP_NATIVE_WINDOW_APPROVAL_REQUIRED')
      if (!capture) {
        const { browser, browserPolicy } = activeProviders(ctx)
        if (browser && !browserPolicy?.evidence) throw new Error(`ERP_NATIVE_BROWSER_PROVIDER_UNSUPPORTED: ${browser}`)
        throw new Error('ERP_NATIVE_FRESH_SNAPSHOT_REQUIRED')
      }
      const observation = captureObservation(capture, system)
      if (!observation) throw new Error('ERP_NATIVE_SNAPSHOT_OUTSIDE_SYSTEM')
      return storage.call('observe', observation, exec.signal)
    },
  }))
  return (agent, system) => {
    const { browser, browserPolicy } = activeProviders(ctx)
    if (browser && !browserPolicy?.evidence) return { kind: 'unsupported-provider', provider: browser }
    const capture = freshCapture(agent, system)
    // Window evidence requires the separately confirmed save tool.
    if (!capture || usedForExplore.has(capture) || capture.source === 'window') return undefined
    const observation = captureObservation(capture, system)
    if (!observation) return undefined
    usedForExplore.add(capture)
    return { kind: 'snapshot', observation }
  }
}
