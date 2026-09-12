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
    const scope = { site: 'fixture', account: 'reader' }
    const record = { id: 'cli-menu', kind: 'menu', name: 'Synthetic menu', aliases: ['测试'], description: 'Unverified fixture hypothesis',
      expectedVersion: 0, stage: 'interpreted', flags: ['needs-review'], lifecycle: 'active', evidence: [], dependencies: [] }
    const specs = [
      ['erp_runtime_status', {}],
      ['erp_model_probe', { provider: 'erp-fixture', model: 'test-model' }],
      ['erp_approval_probe', {}],
      ['erp_storage_status', {}],
      ['erp_browser_status', {}],
      ['erp_browser_open', { siteUrl: 'https://example.invalid/erp/', scope: { site: 'fixture', account: 'reader' } }],
      ['erp_browser_close', {}],
      ['erp_knowledge_record', { scope, records: [record] }],
      ['erp_knowledge_get', { scope, id: record.id }],
      ['erp_knowledge_search', { scope, query: '测试', after: '', limit: 10 }],
    ]
    if (results.length >= specs.length) {
      const body = results[0].content.find(b => b.type === 'text').text
      const health = JSON.parse(body)
      assert.ok(health.pid > 0)
      const storage = JSON.parse(results[3].content.find(b => b.type === 'text').text)
      assert.equal(storage.schemaVersion, 3)
      assert.equal(storage.journalMode, 'wal')
      const browser = JSON.parse(results[5].content.find(b => b.type === 'text').text)
      assert.equal(browser.state, 'manual'); assert.equal(browser.pageUrl, '')
      assert.equal(JSON.parse(results[6].content.find(b => b.type === 'text').text).state, 'closed')
      const knowledge = index => JSON.parse(results[index].content.find(b => b.type === 'text').text.split('\n').slice(1).join('\n'))
      assert.equal(knowledge(7)[0].origin, 'ai')
      assert.equal(knowledge(8).record.id, record.id)
      assert.equal(knowledge(9).items[0].record.id, record.id)
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
