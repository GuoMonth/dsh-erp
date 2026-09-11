import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { LlmAdapter } from '@deepseek-ai/dsh-llm'
import * as plugin from '../dist/index.js'
import { mount, exercise } from './harness.mjs'

test('real rc2 tools, model service, schema and unload lifecycle', async () => { await exercise(plugin) })
test('plugin can be disabled and reloaded with a fresh worker', async t => {
  const host = await mount(plugin)
  t.after(() => host.dispose())
  const first = await host.run('erp_runtime_status')
  await host.fiber.dispose()
  const reloaded = await host.ctx.plugin(plugin)
  t.after(() => reloaded.dispose())
  const next = await host.run('erp_runtime_status')
  assert.equal(next.isError, false)
  assert.notEqual(next.value.pid, first.value.pid)
})
test('host approval grants once, rejects and leaves an audit trail', async t => {
  const host = await mount(plugin)
  t.after(() => host.dispose())
  const events = [{ type: 'turn/start' }]
  const agent = { session: {
    get seq() { return events.length },
    eventAt(seq) { return events[seq] },
    append(type, data) { const e = { type, data }; events.push(e); return e },
  } }
  let answer = 'allowed-once'
  const stop = host.ctx.on('approval/request', async () => answer)
  t.after(stop)
  assert.equal((await host.run('erp_approval_probe', {}, { agent })).isError, false)
  answer = 'rejected'
  assert.equal((await host.run('erp_approval_probe', {}, { agent })).isError, true)
  assert.equal(events.filter(e => e.type === 'approval/asked').length, 2)
  assert.deepEqual(events.filter(e => e.type === 'approval/decided').map(e => e.data.outcome), ['allowed-once', 'rejected'])
})
test('model failure is reported as failure rather than a successful empty reply', async t => {
  class Failing extends LlmAdapter { async *stream() { throw new Error('provider failure') } }
  const host = await mount(plugin, new Failing())
  t.after(() => host.dispose())
  assert.equal((await host.run('erp_model_probe', { provider: 'erp-test', model: 'fixture' })).isError, true)
})
test('unload aborts and drains active host model calls', async t => {
  let entered
  const ready = new Promise(resolve => { entered = resolve })
  let stopped = false
  class Waiting extends LlmAdapter {
    async *stream(options) {
      entered()
      try { await delay(30_000, undefined, { signal: options.signal }) }
      finally { stopped = true }
    }
  }
  const host = await mount(plugin, new Waiting())
  t.after(() => host.dispose())
  const pending = host.run('erp_model_probe', { provider: 'erp-test', model: 'fixture' })
  await ready
  await host.fiber.dispose()
  assert.equal(stopped, true)
  assert.equal((await pending).isError, true)
})
