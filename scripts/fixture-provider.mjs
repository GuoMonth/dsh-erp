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
  constructor(scope) { super(); this.scope = scope }
  async *stream(options) {
    options.signal.throwIfAborted()
    const messages = options.messages
    if (messages.some(m => m.content.some(b => b.type === 'text' && b.text.startsWith('Reply with exactly ERP_MODEL_OK.')))) {
      yield* textChunks('ERP_MODEL_OK')
      return
    }
    const results = messages.flatMap(m => m.content.filter(b => b.type === 'tool-result'))
    for (const result of results) assert.notEqual(result.isError, true, JSON.stringify(result))
    const scope = this.scope
    const record = { id: 'cli-menu', kind: 'menu', name: 'Synthetic menu', aliases: ['测试'], description: 'Unverified fixture hypothesis',
      expectedVersion: 0, stage: 'interpreted', flags: ['needs-review'], lifecycle: 'active', evidence: [], dependencies: [] }
    const parsed = i => { const text = results[i]?.content.find(b => b.type === 'text')?.text; return text ? JSON.parse(text.slice(text.indexOf('{'))) : {} }
    const connected = parsed(15), snapshot = parsed(17), actionResult = parsed(19)
    const menu = snapshot.controls?.find(c => c.kind === 'menuitem' || c.kind === 'treeitem')
    const specs = [
      ['erp_runtime_status', {}],
      ['erp_model_probe', { provider: 'erp-fixture', model: 'test-model' }],
      ['erp_approval_probe', {}],
      ['erp_storage_status', {}],
      ['erp_browser_status', {}],
      ['erp_browser_open', {}],
      ['erp_browser_close', {}],
      ['erp_knowledge_record', { scope, records: [record] }],
      ['erp_knowledge_get', { scope, id: record.id }],
      ['erp_knowledge_search', { scope, query: '测试', after: '', limit: 10 }],
      ['erp_learning_start', { scope, id: 'cli-round', units: [{ id: 'global', level: 1, label: 'Global structure' }] }],
      ['erp_learning_status', { scope, id: 'cli-round' }],
      ['erp_storage_backup', {}],
      ['erp_storage_check', {}],
      ['erp_knowledge_export', { scope }],
      ['erp_connect', {}],
      ['erp_browser_resume', { sessionId: connected.sessionId, revision: connected.revision }],
      ['erp_browser_snapshot', {}],
      ['erp_learning_import_snapshot', { scope, observationId: snapshot.observationId }],
      ['erp_browser_action', { sessionId: snapshot.sessionId, revision: snapshot.revision, snapshotId: snapshot.snapshotId, ref: menu?.ref, operation: 'click', reason: 'Inspect the first discovered menu in the synthetic test ERP' }],
      ['erp_learning_import_snapshot', { scope, observationId: actionResult.observationId }],
      ['erp_browser_close', {}],
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
      assert.equal(knowledge(14).records, 1)
      assert.ok(knowledge(14).markdownPath.endsWith('.md'))
      assert.ok(JSON.stringify(actionResult.frames).includes('P-501'))
      assert.ok(actionResult.controls.some(c => c.kind === 'field' && c.options.length))
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
  ctx.llm.registerAdapter(['erp-fixture'], new Fixture(ctx.erp.system.scope))
  ctx.on('approval/request', (request, next) => ['erp_approval_probe', 'erp_browser_resume', 'erp_browser_action'].includes(request.toolName) ? Promise.resolve('allowed-once') : next())
}
