import assert from 'node:assert/strict'
import { test } from 'node:test'
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
import Tools from '@deepseek-ai/dsh-tools'
import Llm, { ToolCallId } from '@deepseek-ai/dsh-llm'
import Sessions, { SessionId } from '@deepseek-ai/dsh-session'
import Agents from '@deepseek-ai/dsh-agent'
import Loop from '@deepseek-ai/dsh-agent-loop'
import Projections from '@deepseek-ai/dsh-session-projection'
import Approval from '@deepseek-ai/dsh-user-approval'
import ComputerUse from '@deepseek-ai/dsh-computer-use'
import * as NativeComputer from '@deepseek-ai/dsh-experimental-computer-use-cua-driver-native'
import * as NativeErp from '../dist/native.js'

test('official Browser Use attaches to real Chromium, respects approval, saves evidence and cleans Session ownership', { timeout: 60000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'erp-native-'))
  const ctx = new Context()
  let browserContext
  const server = createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' })
    response.end('<!doctype html><title>Native ERP fixture</title><h1>Purchasing</h1><button onclick="this.outerHTML=\'<p>Outcome checked</p>\'">Continue</button>')
  })
  t.after(async () => {
    await ctx.fiber.dispose(); await browserContext?.close(); server.closeAllConnections()
    await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true })
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const url = `http://127.0.0.1:${server.address().port}/erp/`
  const modules = new Map([
    ['prompt', SystemPrompt], ['tools', Tools], ['llm', Llm], ['sessions', Sessions],
    ['agents', Agents], ['loop', Loop], ['projections', Projections], ['approval', Approval], ['erp', NativeErp],
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
  const status = await ctx.tools.execute({ name: 'erp_native_status', arguments: {}, callId: ToolCallId('native-status'), signal: new AbortController().signal })
  assert.equal(status.isError, false, JSON.stringify(status)); assert.equal(status.value.browserProvider, 'playwright-mcp')
  assert.equal(ctx.tools.schemas().some(tool => tool.name === 'erp_browser_action'), false)
  const first = await ctx.agents.create({ sessionId: SessionId('native-first'), meta: { cwd: root } })
  await first.agent.whenIdle(); first.agent.session.append('turn/start', { turn: 1 })
  let answer = 'rejected', sequence = 0, decisions = 0
  ctx.on('approval/request', async () => { decisions++; return answer })
  const run = (name, arguments_ = {}, owner = first) => ctx.tools.execute({ agent: owner.agent,
    callId: ToolCallId(`native-test-${++sequence}`), name, arguments: arguments_, signal: new AbortController().signal })
  assert.equal((await run('mcp__playwright-mcp__browser_navigate', { url })).isError, true)
  assert.equal((await attached.contexts()[0].pages()[0]?.url()) ?? 'about:blank', 'about:blank')
  answer = 'allowed-once'
  const navigation = await run('mcp__playwright-mcp__browser_navigate', { url }); assert.equal(navigation.isError, false, JSON.stringify(navigation))
  const snapshot = await run('mcp__playwright-mcp__browser_snapshot'); assert.equal(snapshot.isError, false, JSON.stringify(snapshot))
  const saved = await run('erp_native_observation_save'); assert.equal(saved.isError, false, JSON.stringify(saved)); assert.match(saved.value.text, /Purchasing/)
  const scope = (await run('erp_system_status')).value.scope
  const learned = await run('erp_knowledge_record', { scope, records: [{ id: 'native-menu', kind: 'menu', name: 'Purchasing', aliases: [], description: 'Observed menu label.',
    expectedVersion: 0, stage: 'observed', flags: [], lifecycle: 'active', evidence: [{ observationId: saved.value.id, quote: 'Purchasing' }], dependencies: [] }] })
  assert.equal(learned.isError, false, JSON.stringify(learned))
  const text = snapshot.content.filter(block => block.type === 'text').map(block => block.text).join('\n')
  const ref = text.match(/button "Continue" \[ref=([^\]]+)\]/)?.[1]; assert.ok(ref, text)
  const clicked = await run('mcp__playwright-mcp__browser_click', { target: ref }); assert.equal(clicked.isError, false, JSON.stringify(clicked))
  assert.equal((await run('erp_native_observation_save')).isError, true, 'an action invalidates prior evidence')
  assert.equal((await run('mcp__playwright-mcp__browser_snapshot')).isError, false)
  assert.match((await run('erp_native_observation_save')).value.text, /Outcome checked/)
  const second = await ctx.agents.create({ sessionId: SessionId('native-second'), meta: { cwd: root } })
  await second.agent.whenIdle(); second.agent.session.append('turn/start', { turn: 1 })
  assert.equal((await run('erp_native_observation_save', {}, second)).isError, true, 'another Agent cannot inherit captured evidence')
  assert.equal((await run('mcp__playwright-mcp__browser_snapshot', {}, second)).isError, true, 'attach reservation is exclusive')
  await second.dispose()
  assert.ok(decisions >= 5)
  first.agent.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } }); await first.dispose()
  assert.equal(attached.isConnected(), true, 'host-owned attached browser stays open')
  assert.ok((await attached.contexts()[0].pages()[0].content()).includes('Outcome checked'))
})

test('installed native Cua Driver exposes its catalog, reads permission status without prompting and unloads', { timeout: 30000 }, async t => {
  const ctx = new Context(); t.after(() => ctx.fiber.dispose())
  await ctx.plugin(ComputerUse); await ctx.plugin(SystemPrompt); await ctx.plugin(Tools)
  const provider = await ctx.plugin(NativeComputer)
  assert.equal(ctx.computerUse.providerName, 'cua-driver-native')
  assert.ok(ctx.tools.schemas().some(tool => tool.name === 'cua_driver_native__get_window_state'))
  const result = await ctx.tools.execute({ name: 'cua_driver_native__check_permissions', arguments: { prompt: false },
    callId: ToolCallId('native-permissions'), signal: new AbortController().signal })
  assert.equal(result.isError, false, JSON.stringify(result))
  assert.ok(result.content.some(block => block.type === 'text')); assert.ok(!result.content.some(block => block.type === 'image'))
  await provider.dispose()
  assert.equal(ctx.computerUse.providerName, undefined); assert.deepEqual(ctx.tools.schemas(), [])
})
