import assert from 'node:assert/strict'
import { test } from 'vitest'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools, { defineTool } from '@deepseek-ai/dsh-tools'
import * as NativeExecutor from '@deepseek-ai/dsh-tool-executor-native'
import Llm, { ToolCallId } from '@deepseek-ai/dsh-llm'
import Sessions, { SessionId } from '@deepseek-ai/dsh-session'
import Agents from '@deepseek-ai/dsh-agent'
import Commands from '@deepseek-ai/dsh-commands'
import Loop from '@deepseek-ai/dsh-agent-loop'
import Projections from '@deepseek-ai/dsh-session-projection'
import Approval from '@deepseek-ai/dsh-user-approval'
import Fs from '@deepseek-ai/dsh-fs-local'
import WorkingDirectory from '@deepseek-ai/dsh-working-directory'
import BrowserUse from '@deepseek-ai/dsh-browser-use'
import { BrowserUseProviderName } from '@deepseek-ai/dsh-browser-use/brand'
import ComputerUse from '@deepseek-ai/dsh-computer-use'
import { ComputerUseProviderName } from '@deepseek-ai/dsh-computer-use/brand'
import * as NativeComputer from '@deepseek-ai/dsh-experimental-computer-use-cua-driver-native'
import * as NativeErp from '../dist/native.js'
import * as Erp from '../dist/index.js'
import { executeCall, mount } from './harness.mjs'

test('official Browser Use attaches to real Chromium, respects approval, saves evidence and cleans Session ownership', { timeout: 60000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'erp-native-'))
  const ctx = new Context()
  let browserContext
  const server = createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' })
    response.end('<!doctype html><title>Native ERP fixture</title><h1>Purchasing</h1><button onclick="this.outerHTML=\'<p>Outcome checked</p>\'">Continue</button>')
  })
  t.onTestFinished(async () => {
    await ctx.fiber.dispose(); await browserContext?.close(); server.closeAllConnections()
    await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true })
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const url = `http://127.0.0.1:${server.address().port}/erp/`
  const modules = new Map([
    ['prompt', SystemPrompt], ['tools', Tools], ['executor', NativeExecutor], ['llm', Llm], ['sessions', Sessions],
    ['agents', Agents], ['loop', Loop], ['projections', Projections], ['approval', Approval],
    ['fs', Fs], ['workingDirectory', WorkingDirectory], ['commands', Commands], ['erp', NativeErp],
  ])
  const profile = join(root, 'browser-profile')
  browserContext = await chromium.launchPersistentContext(profile, { executablePath: chromium.executablePath(), headless: true, args: ['--no-sandbox', '--remote-debugging-port=0'] })
  const attached = browserContext.browser()
  const endpointPort = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]
  const config = join(root, 'cordis.json')
  await writeFile(config, JSON.stringify([...modules.keys()].map(name => ({ id: name, name,
    config: name === 'loop' ? { agents: [] } : name === 'erp' ? {
      system: { url, account: 'fixture-reader' }, dataDir: join(root, 'data'), browserEndpoint: `http://127.0.0.1:${endpointPort}`,
    } : {} }))))
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader); ctx.loader.builtins.include = Include
  ctx.loader.internal = { version: 'v2', async import(name) { assert.ok(modules.has(name)); return modules.get(name) } }
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(config).href } }); await ctx.loader.await()
  for (const entry of ctx.loader.entries()) if (entry.fiber) await entry.fiber.await()
  const status = await executeCall(ctx.tools, { name: 'erp_native_status', callId: ToolCallId('native-status'), signal: new AbortController().signal })
  assert.equal(status.isError, false, JSON.stringify(status)); assert.equal(status.value.browserProvider, 'playwright-mcp')
  assert.equal(status.value.browserSnapshotTool, 'mcp__playwright-mcp__browser_snapshot')
  assert.equal(status.value.scope, null)
  assert.equal(ctx.tools.schemas().some(tool => tool.name === 'erp_browser_action'), false)
  const site = ctx.erp.catalog.sole()
  const local = ctx.erp.catalog.client(site.id)
  const scope = site.profile.scope
  const execute = (owner, line) => ctx.commands.execute(owner.agent, line, [], AbortSignal.timeout(15_000))
  let answer = 'rejected', sequence = 0, decisions = 0
  ctx.on('approval/request', async () => { decisions++; return answer })
  const runFor = (owner, name, arguments_ = {}) => executeCall(ctx.tools, { agent: owner.agent,
    callId: ToolCallId(`native-test-${++sequence}`), name, args: arguments_, signal: new AbortController().signal })
  const unrelated = await ctx.agents.create({ sessionId: SessionId('native-unrelated'), meta: { cwd: root } })
  await unrelated.agent.whenIdle()
  unrelated.agent.session.append('turn/start', { turn: 1 })
  const unrelatedNavigation = await runFor(unrelated, 'mcp__playwright-mcp__browser_navigate', { url })
  assert.equal(unrelatedNavigation.isError, false, JSON.stringify(unrelatedNavigation))
  const unrelatedSnapshot = await runFor(unrelated, 'mcp__playwright-mcp__browser_snapshot')
  assert.equal(unrelatedSnapshot.isError, false, JSON.stringify(unrelatedSnapshot))
  assert.equal(decisions, 0, 'an unrelated conversation must not receive ERP approval')
  assert.equal((await runFor(unrelated, 'erp_native_status')).value.scope, null)
  assert.match((await runFor(unrelated, 'erp_native_observation_save')).error.message, /ERP_NATIVE_SITE_UNBOUND/)
  assert.deepEqual((await runFor(unrelated, 'erp_system_status')).value.scope, scope, 'single-site CLI can activate its configured site')
  assert.match((await runFor(unrelated, 'erp_native_observation_save')).error.message, /ERP_NATIVE_FRESH_SNAPSHOT_REQUIRED/)
  unrelated.agent.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  await unrelated.dispose()
  await attached.contexts()[0].pages()[0].goto('about:blank')
  const first = await ctx.agents.create({ sessionId: SessionId('native-first'), meta: { cwd: site.workspaceDir } })
  const run = (name, arguments_, owner = first) => runFor(owner, name, arguments_)
  await first.agent.whenIdle()
  const paused = await execute(first, '/explore')
  assert.match(paused.result.text, /Exploration is paused/)
  assert.equal((await local.call('task', { scope, id: 'explore' })).state, 'paused')
  first.agent.session.append('turn/start', { turn: 1 })
  assert.equal((await run('mcp__playwright-mcp__browser_navigate', { url })).isError, true)
  assert.equal((await attached.contexts()[0].pages()[0]?.url()) ?? 'about:blank', 'about:blank')
  answer = 'allowed-once'
  const navigation = await run('mcp__playwright-mcp__browser_navigate', { url }); assert.equal(navigation.isError, false, JSON.stringify(navigation))
  const snapshot = await run('mcp__playwright-mcp__browser_snapshot'); assert.equal(snapshot.isError, false, JSON.stringify(snapshot))
  const saved = await run('erp_native_observation_save'); assert.equal(saved.isError, false, JSON.stringify(saved)); assert.match(saved.value.text, /Purchasing/)
  assert.deepEqual((await run('erp_system_status')).value.scope, scope)
  first.agent.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  const started = await execute(first, '/explore')
  assert.match(started.result.text, /Exploration has started|This exploration round is complete/)
  const index = await local.call('indexRead', { scope, after: '', limit: 20 })
  assert.equal(index.initialized, true, 'the same Agent snapshot advances the saved round')
  assert.ok(index.summaries.some(summary => summary.level === 1))
  const lifecycle = Array.from({ length: first.agent.session.seq }, (_, seq) => first.agent.session.eventAt(seq))
    .filter(event => event.type === 'command/run' || event.type === 'command/done')
  assert.deepEqual(lifecycle.map(event => event.type), ['command/run', 'command/done', 'command/run', 'command/done'])
  first.agent.session.append('turn/start', { turn: 2 })
  const learned = await run('erp_knowledge_record', { scope, records: [{ id: 'native-menu', kind: 'menu', name: 'Purchasing', aliases: [], description: 'Observed menu label.',
    expectedVersion: 0, stage: 'observed', flags: [], lifecycle: 'active', evidence: [{ observationId: saved.value.id, quote: 'Purchasing' }], dependencies: [] }] })
  assert.equal(learned.isError, false, JSON.stringify(learned))
  const text = snapshot.content.filter(block => block.type === 'text').map(block => block.text).join('\n')
  const ref = text.match(/button "Continue" \[ref=([^\]]+)\]/)?.[1]; assert.ok(ref, text)
  const clicked = await run('mcp__playwright-mcp__browser_click', { target: ref }); assert.equal(clicked.isError, false, JSON.stringify(clicked))
  assert.equal((await run('erp_native_observation_save')).isError, true, 'an action invalidates prior evidence')
  assert.equal((await run('mcp__playwright-mcp__browser_snapshot')).isError, false)
  assert.match((await run('erp_native_observation_save')).value.text, /Outcome checked/)
  const second = await ctx.agents.create({ sessionId: SessionId('native-second'), meta: { cwd: site.workspaceDir } })
  await second.agent.whenIdle()
  const secondRound = await execute(second, '/explore-update')
  assert.match(secondRound.result.text, /Exploration is paused/, 'another Agent cannot consume the browser snapshot')
  second.agent.session.append('turn/start', { turn: 1 })
  assert.equal((await run('erp_native_observation_save', {}, second)).isError, true, 'another Agent cannot inherit captured evidence')
  assert.equal((await run('mcp__playwright-mcp__browser_snapshot', {}, second)).isError, true, 'attach reservation is exclusive')
  await second.dispose()
  assert.ok(decisions >= 5)
  first.agent.session.append('turn/end', { turn: 2, reason: { kind: 'completed' } }); await first.dispose()
  assert.equal(attached.isConnected(), true, 'host-owned attached browser stays open')
  assert.ok((await attached.contexts()[0].pages()[0].content()).includes('Outcome checked'))
})

test('installed native Cua Driver exposes its catalog, reads permission status without prompting and unloads', { timeout: 30000 }, async t => {
  const ctx = new Context(); t.onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(ComputerUse); await ctx.plugin(SystemPrompt); await ctx.plugin(Tools); await ctx.plugin(NativeExecutor)
  const provider = await ctx.plugin(NativeComputer)
  assert.equal(ctx.computerUse.providerName, 'cua-driver-native')
  assert.ok(ctx.tools.schemas().some(tool => tool.name === 'cua_driver_native__get_window_state'))
  const result = await executeCall(ctx.tools, { name: 'cua_driver_native__check_permissions', args: { prompt: false },
    callId: ToolCallId('native-permissions'), signal: new AbortController().signal })
  assert.equal(result.isError, false, JSON.stringify(result))
  assert.ok(result.content.some(block => block.type === 'text')); assert.ok(!result.content.some(block => block.type === 'image'))
  await provider.dispose()
  assert.equal(ctx.computerUse.providerName, undefined); assert.deepEqual(ctx.tools.schemas(), [])
})

test('ERP composes host decisions and reports the snapshot support of the active native providers', async t => {
  const root = await mkdtemp(join(tmpdir(), 'erp-native-policy-'))
  let hostDecision
  let windowNumber = 0
  const fixture = {
    ...Erp,
    async apply(ctx, config) {
      await ctx.plugin(BrowserUse)
      await ctx.plugin(ComputerUse)
      await ctx.plugin(Commands)
      await ctx.plugin({
        inject: ['browserUse', 'computerUse', 'tools'],
        apply(scope) {
          scope.effect(() => scope.browserUse.register(BrowserUseProviderName('stagehand-native')))
          scope.effect(() => scope.computerUse.register(ComputerUseProviderName('cua-driver-native')))
          for (const [name, read] of [
            ['stagehand_observe', () => 'Stagehand fixture result'],
            ['cua_driver_native__get_window_state', () => `- button "Window ${++windowNumber}"`],
          ]) {
            scope.tools.register(defineTool({
              name,
              description: 'Native provider policy fixture',
              parameters: {},
              output: { schema: { type: 'string' }, render: (_args, text) => [{ type: 'text', text }] },
              execute: read,
            }))
          }
        },
      })
      ctx.on('tools/pre-execute', async (exec, next) =>
        exec.name === 'stagehand_observe' && hostDecision ? hostDecision : next())
      await Erp.apply(ctx, config)
    },
  }
  let host
  let disposeAgent
  t.onTestFinished(async () => { await disposeAgent?.(); await host?.dispose(); await rm(root, { recursive: true, force: true }) })
  host = await mount(fixture, undefined, { browserMode: 'native', dataDir: root, system: { url: 'https://erp.example/app/' } })
  await host.ctx.plugin(Sessions)
  await host.ctx.plugin(Agents)
  await host.ctx.plugin(Loop, { agents: [] })
  const site = host.ctx.erp.catalog.sole()
  const { agent, dispose } = await host.ctx.agents.create({ sessionId: SessionId('native-policy'), meta: { cwd: site.workspaceDir } })
  disposeAgent = dispose
  await agent.whenIdle()
  const explore = await host.ctx.commands.execute(agent, '/explore', [], AbortSignal.timeout(5000))
  assert.match(explore.result.text, /stagehand-native has no ERP snapshot tool/)
  agent.session.append('turn/start', { turn: 1 })

  const requests = []
  let replaceWindow = false
  const run = name => host.run(name, {}, { agent, signal: AbortSignal.timeout(5000) })
  host.ctx.on('approval/request', async request => {
    requests.push(request)
    if (request.toolName === 'erp_native_observation_save' && replaceWindow) {
      assert.equal((await run('cua_driver_native__get_window_state')).isError, false)
    }
    return 'allowed-once'
  })
  const status = await run('erp_native_status')
  assert.equal(status.value.browserProvider, 'stagehand-native')
  assert.equal(status.value.browserSnapshotTool, null)
  assert.equal(status.value.desktopSnapshotTool, 'cua_driver_native__get_window_state')
  assert.deepEqual(status.value.scope, site.profile.scope)

  hostDecision = { kind: 'deny', reason: 'Host fixture denied this call' }
  assert.match((await run('stagehand_observe')).error.message, /Host fixture denied this call/)
  hostDecision = { kind: 'cancel' }
  assert.equal((await run('stagehand_observe')).isError, true)
  assert.equal(requests.length, 0)

  hostDecision = { kind: 'ask', reason: 'Host approval', displayReason: { en: 'English approval', zh: '宿主审批' } }
  assert.equal((await run('stagehand_observe')).isError, false)
  assert.match(requests[0].reason, /Host approval.*Allow stagehand_observe/s)
  assert.match(requests[0].displayReason.zh, /宿主审批.*Allow stagehand_observe/s)
  assert.match((await run('erp_native_observation_save')).error.message, /ERP_NATIVE_BROWSER_PROVIDER_UNSUPPORTED: stagehand-native/)

  assert.equal((await run('cua_driver_native__get_window_state')).isError, false)
  const saved = await run('erp_native_observation_save')
  assert.equal(saved.isError, false, JSON.stringify(saved))
  assert.match(saved.value.text, /Window 1/)
  assert.match(requests.at(-1).reason, /belongs to the configured ERP site/)

  replaceWindow = true
  const changed = await run('erp_native_observation_save')
  assert.match(changed.error.message, /ERP_NATIVE_WINDOW_APPROVAL_REQUIRED/)
  const observations = await host.ctx.erp.catalog.client(site.id).call('search', { scope: site.profile.scope, query: 'Window 2', limit: 10 })
  assert.deepEqual(observations, [])
  agent.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
})
