import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import Llm, { LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm'
import Approval from '@deepseek-ai/dsh-user-approval'

export class ProbeAdapter extends LlmAdapter {
  requests = []
  async *stream(options) {
    options.signal.throwIfAborted()
    this.requests.push(options)
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: 'ERP_MODEL_OK' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'ERP_MODEL_OK' } }
    yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 3 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}
export async function mount(plugin, adapter = new ProbeAdapter()) {
  const ctx = new Context()
  const fibers = []
  try {
    fibers.push(await ctx.plugin(SystemPrompt))
    fibers.push(await ctx.plugin(Tools))
    fibers.push(await ctx.plugin(Llm))
    fibers.push(await ctx.plugin(Approval))
    fibers.push(await ctx.plugin(Object.assign(inner => {
      inner.llm.registerAdapter(['erp-test'], adapter)
    }, { inject: ['llm'] })))
    const fiber = await ctx.plugin(plugin)
    fibers.push(fiber)
    let call = 0
    return { ctx, fiber, adapter,
      run(name, args = {}, options = {}) {
        return ctx.tools.execute({ callId: ToolCallId(`erp-test-${++call}`), name, arguments: args,
          signal: new AbortController().signal, ...options })
      },
      async dispose() { for (const f of fibers.reverse()) await f.dispose() },
    }
  } catch (error) { for (const f of fibers.reverse()) await f.dispose(); throw error }
}
export async function exercise(plugin) {
  const host = await mount(plugin)
  try {
    const status = await host.run('erp_runtime_status')
    assert.equal(status.isError, false, JSON.stringify(status))
    assert.notEqual(status.value.pid, process.pid)
    const model = await host.run('erp_model_probe', { provider: 'erp-test', model: 'fixture' })
    assert.equal(model.isError, false, JSON.stringify(model))
    assert.equal(model.value, 'ERP_MODEL_OK')
    assert.equal(host.adapter.requests.length, 1)
    const invalid = await host.run('erp_model_probe', { provider: 123, model: 'fixture' })
    assert.equal(invalid.isError, true)
    assert.equal(host.adapter.requests.length, 1)
    const denied = await host.run('erp_approval_probe')
    assert.equal(denied.isError, true)
    const pid = status.value.pid
    await host.fiber.dispose()
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
    assert.equal((await host.run('erp_runtime_status')).isError, true)
    return { tools: 'passed', modelService: 'fixture adapter passed', schema: 'passed', approvalWithoutAgent: 'denied', unload: 'passed' }
  } finally { await host.dispose() }
}
