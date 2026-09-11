import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { chromium } from 'playwright'
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
export async function mount(plugin, adapter = new ProbeAdapter(), config = {}) {
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
    const fiber = await ctx.plugin(plugin, config)
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
  const root = await mkdtemp(join(tmpdir(), 'erp-plugin-'))
  const host = await mount(plugin, undefined, { dataDir: join(root, 'data'), browserHeadless: true, browserSandbox: false,
    browserResourcesDir: dirname(dirname(dirname(chromium.executablePath()))) })
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
    const storage = await host.run('erp_storage_status')
    assert.equal(storage.isError, false, JSON.stringify(storage))
    assert.equal(storage.value.schemaVersion, 3)
    assert.equal(storage.value.journalMode, 'wal')
    const scope = { site: 'fixture', account: 'reader' }
    const saved = await host.ctx.erp.storage.call('observe', { id: 'packaged-observation', scope,
      url: 'https://example.invalid/erp', title: 'Fixture', text: 'Packaged storage worker',
      locale: 'en', context: 'test', observedAt: '2026-09-11T00:00:00.000Z' })
    const base = { name: 'Fixture', aliases: ['测试'], description: 'Packaged evidence interpretation', expectedVersion: 0,
      stage: 'observed', flags: [], lifecycle: 'active', evidence: [{ observationId: saved.id, quote: 'Packaged storage worker' }], dependencies: [] }
    const knowledge = await host.run('erp_knowledge_record', { scope, records: [
      { ...base, id: 'menu-1', kind: 'menu' }, { ...base, id: 'domain-1', kind: 'domain', stage: 'interpreted' },
      { ...base, id: 'link-1', kind: 'relation', stage: 'interpreted', from: { id: 'menu-1', version: 1 }, to: { id: 'domain-1', version: 1 }, predicate: 'supports' },
    ] })
    assert.equal(knowledge.isError, false, JSON.stringify(knowledge))
    const related = await host.run('erp_knowledge_neighbors', { scope, id: 'menu-1', direction: 'out', after: '', limit: 10 })
    assert.equal(related.value.items[0].record.to.id, 'domain-1')
    assert.deepEqual((await host.run('erp_observation_get', { scope, id: saved.id })).value, saved)
    const backup = await host.ctx.erp.storage.call('backup', {})
    const browserBefore = await host.run('erp_browser_status')
    assert.equal(browserBefore.value.state, 'closed')
    const browserArgs = { siteUrl: 'https://example.invalid/erp/', scope }
    const opened = await host.run('erp_browser_open', browserArgs)
    assert.equal(opened.isError, false, JSON.stringify(opened))
    assert.equal(opened.value.state, 'manual'); assert.equal(opened.value.pageUrl, '')
    assert.equal((await host.run('erp_browser_resume', { sessionId: opened.value.sessionId, revision: opened.value.revision })).isError, true)
    assert.equal((await host.run('erp_browser_observe')).isError, true)
    assert.equal((await host.run('erp_browser_close')).value.state, 'closed')
    const pid = status.value.pid
    await host.fiber.dispose()
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
    assert.equal((await host.run('erp_runtime_status')).isError, true)
    assert.equal((await host.run('erp_storage_status')).isError, true)
    await plugin.restoreBackup(join(root, 'data'), backup.id, join(root, 'restored'))
    const restored = new plugin.StorageClient({ directory: join(root, 'restored') })
    try {
      assert.deepEqual(await restored.call('observation', { id: saved.id, scope }), saved)
      assert.equal((await restored.call('knowledgeGet', { scope, id: 'link-1' })).record.to.id, 'domain-1')
    }
    finally { await restored.dispose() }
    return { tools: 'passed', modelService: 'fixture adapter passed', schema: 'passed', approvalWithoutAgent: 'denied', storageAndRestore: 'passed', knowledgeAndEvidence: 'passed', browserManualSession: 'passed', unload: 'passed' }
  } finally { await host.dispose(); await rm(root, { recursive: true, force: true }) }
}
