// Test-only provider and approval answerer. Never distribute in the plugin package.
import assert from 'node:assert/strict'
import { LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm'

export const name = 'erp-artifact-fixture'
export const inject = ['llm', 'approval', 'erp']
function* textChunks(text) {
  yield { type: 'block-start', index: 0, blockType: 'text' }
  yield { type: 'text-delta', index: 0, text }
  yield { type: 'block-end', index: 0, block: { type: 'text', text } }
  yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 3 } }
  yield { type: 'finish', reason: { kind: 'stop' } }
}
class Fixture extends LlmAdapter {
  async *stream(options) {
    options.signal.throwIfAborted()
    const messages = options.messages
    if (messages.some(m => m.content.some(b => b.type === 'text' && b.text.startsWith('Reply with exactly ERP_MODEL_OK.')))) {
      yield* textChunks('ERP_MODEL_OK')
      return
    }
    const results = messages.flatMap(m => m.content.filter(b => b.type === 'tool-result'))
    for (const result of results) assert.notEqual(result.isError, true, JSON.stringify(result))
    const specs = [
      ['erp_runtime_status', {}],
      ['erp_model_probe', { provider: 'erp-fixture', model: 'test-model' }],
      ['erp_approval_probe', {}],
    ]
    if (results.length >= specs.length) {
      const body = results[0].content.find(b => b.type === 'text').text
      const health = JSON.parse(body)
      assert.ok(health.pid > 0)
      yield* textChunks(`ERP_HOST_SMOKE_OK worker=${health.pid}`)
      return
    }
    const [name, args] = specs[results.length]
    const id = ToolCallId(`erp-smoke-${results.length}`)
    const argumentsText = JSON.stringify(args)
    yield { type: 'block-start', index: 0, blockType: 'tool-call' }
    yield { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: argumentsText }
    yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: argumentsText } }
    yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 3 } }
    yield { type: 'finish', reason: { kind: 'tool-calls' } }
  }
}
export function apply(ctx) {
  ctx.llm.registerAdapter(['erp-fixture'], new Fixture())
  ctx.on('approval/request', (request, next) => request.toolName === 'erp_approval_probe' ? Promise.resolve('allowed-once') : next())
}
