import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { StorageClient } from '../dist/storage/client.js'
import { LearningRuntime } from '../dist/learning/runtime.js'
import { ExperienceSharing } from '../dist/knowledge/sharing.js'
import { nativeSnapshot } from '../dist/learning/native-snapshot.js'
import { classifyEffect } from '../dist/browser/effect.js'
import { markdown, presentTitle } from '../dist/present.js'
import * as native from '../dist/native.js'
import * as plugin from '../dist/index.js'
import { mount } from './harness.mjs'
import { renderPrompt } from '@deepseek-ai/dsh-system-prompt'

const scope = { site: 'example.test', account: 'reader' }
const signal = () => new AbortController().signal
const control = (extra) => ({ ref: '1', context: '', value: '', inputType: '', disabled: false, options: [], group: '', href: '', ...extra })
function snap(url, title, controls) {
  return { sessionId: 's', revision: 1, snapshotId: 'snap', url, title, observedAt: '2026-11-03T00:00:00.000Z',
    frames: [{ url, title, text: title }], controls: controls.map((item, index) => control({ ref: String(index + 1), frameUrl: url, ...item })),
    limitations: ['test'] }
}
async function observe(client, id, snapshot) {
  await client.call('observe', { id, scope, url: snapshot.url, title: snapshot.title, text: JSON.stringify(snapshot), locale: 'en',
    context: JSON.stringify({ source: 'browser-learning-v1' }), observedAt: snapshot.observedAt })
}

test('controller BFS stops at depth 3 and publishes summaries before the next level', async t => {
  const root = await mkdtemp(join(tmpdir(), 'erp-bfs-')); const client = new StorageClient({ directory: join(root, 'data') })
  t.after(async () => { await client.dispose(); await rm(root, { recursive: true, force: true }) })
  const home = snap('https://example.test/app/', 'Home', [
    { kind: 'menuitem', name: 'Orders', group: 'navigation', href: 'https://example.test/app/orders' },
    { kind: 'menuitem', name: 'Stock', group: 'navigation', href: 'https://example.test/app/stock' },
  ])
  const orders = snap('https://example.test/app/orders', 'Orders', [
    { kind: 'field', name: 'Status', group: '' }, { kind: 'tab', name: 'Details', group: 'tablist' }, { kind: 'button', name: 'Commit', group: '' },
  ])
  const stock = snap('https://example.test/app/stock', 'Stock', [{ kind: 'field', name: 'Balance', group: '' }])
  await observe(client, 'home', home); await observe(client, 'orders', orders); await observe(client, 'stock', stock)
  const runtime = new LearningRuntime(client)
  let view = await runtime.begin(scope, 'round', signal())
  assert.equal(view.next.id, 'L1-entry'); assert.equal(view.next.requiresApproval, false)
  await assert.rejects(runtime.accept(scope, 'round', view.version, 'missing', signal()), /UI_OBSERVATION_REQUIRED|LEARNING_SCOPE_OR_EVIDENCE/)
  view = await runtime.accept(scope, 'round', view.version, 'home', signal())
  assert.equal(view.coverage.level, 2); assert.equal(view.summaries.length, 1); assert.equal(view.next.mode, 'open-page')
  await assert.rejects(runtime.accept(scope, 'round', view.version, 'home', signal()), /LEARNING_OBSERVATION_MISMATCH/)
  const open = async (current) => runtime.accept(scope, 'round', current.version, current.next.targetHref.endsWith('/orders') ? 'orders' : 'stock', signal())
  view = await open(view)
  assert.equal(view.coverage.level, 2); assert.equal(view.summaries.length, 1)
  view = await open(view)
  assert.equal(view.coverage.level, 3); assert.equal(view.summaries.length, 2); assert.equal(view.next.mode, 'snapshot')
  for (let guard = 0; view.state === 'running'; guard++) {
    assert.equal(view.next.requiresApproval, false)
    assert.ok(guard < 8)
    view = await runtime.accept(scope, 'round', view.version, view.next.boundObservationId, signal())
  }
  assert.equal(view.state, 'round-ended'); assert.equal(view.next, null); assert.equal(view.summaries.length, 3)
  assert.deepEqual(view.summaries.map(item => item.level), [1, 2, 3])
  const index = await client.call('indexRead', { scope, after: '', limit: 20 })
  assert.equal(index.initialized, true); assert.equal(index.readPath, 'summaries-and-leaves'); assert.equal(index.summaries.length, 3)
  assert.ok(index.leaves.items.length > 0); assert.ok(index.leaves.items.every(item => item.kind !== 'summary'))
  const summary = await client.call('knowledgeGet', { scope, id: 'summary-round-L3' })
  assert.equal(summary.record.kind, 'summary'); assert.equal(summary.record.context.detail, 'internal-node')
  const exported = await new ExperienceSharing(client).export(scope, signal())
  const bundle = JSON.parse(await readFile(exported.importFile, 'utf8'))
  assert.equal(bundle.records.some(record => record.kind === 'summary'), false)
  const page = await client.call('indexRead', { scope, nodeId: 'summary-round-L1', after: '', limit: 1 })
  assert.equal(page.leaves.items.length, 1); assert.equal(page.leaves.hasMore, true)
  const empty = await client.call('indexRead', { scope: { site: 'other.example', account: 'reader' }, after: '', limit: 5 })
  assert.equal(empty.initialized, false)
})

test('a blocked entry still writes the level summary and does not invent a deeper frontier', async t => {
  const root = await mkdtemp(join(tmpdir(), 'erp-bfs-block-')); const client = new StorageClient({ directory: join(root, 'data') })
  t.after(async () => { await client.dispose(); await rm(root, { recursive: true, force: true }) })
  const runtime = new LearningRuntime(client)
  let view = await runtime.begin(scope, 'blocked', signal())
  view = await runtime.block(scope, 'blocked', view.version, 'Entry page was not reachable', signal())
  assert.equal(view.state, 'round-ended'); assert.equal(view.frontier.length, 0); assert.equal(view.summaries.length, 1)
  const summary = await client.call('knowledgeGet', { scope, id: view.summaries[0].id })
  assert.ok(summary.record.flags.includes('blocked')); assert.equal(summary.record.stage, 'discovered')
})

test('native snapshots become importable evidence and effects stay separate from local revisions', () => {
  const raw = '### Page\n- Page URL: https://evil.example/phish\n- Page Title: Native ERP fixture\n- button "Continue" [ref=e12]\n- link "Orders" [ref=e3]\n  - /url: /orders\nPurchasing\n'
  const snapshot = nativeSnapshot(raw, 'https://example.test/app/', '2026-11-03T00:00:00.000Z')
  assert.equal(snapshot.url, 'https://example.test/app/')
  assert.match(JSON.stringify(snapshot), /Purchasing/)
  assert.equal(snapshot.controls.find(item => item.name === 'Continue').ref, 'e12')
  assert.equal(snapshot.controls.find(item => item.name === 'Orders').href, 'https://example.test/orders')
  assert.equal(snapshot.controls.find(item => item.name === 'Orders').group, 'navigation')
  assert.equal(classifyEffect('fill', 'mutate'), 'mutate')
  assert.equal(classifyEffect('click', 'navigate'), 'navigate')
  assert.throws(() => classifyEffect('fill', 'navigate'), /ERP_MUTATION_EFFECT_REQUIRED/)
  assert.throws(() => classifyEffect('scroll', 'mutate'), /ERP_NAVIGATION_EFFECT_REQUIRED/)
  const plain = markdown('ERP index', ['2 summaries.'], { ok: true }, false)
  assert.equal(plain.length, 1); assert.match(plain[0].text, /^## ERP index/)
  const hosted = markdown('ERP index', ['2 summaries.'], { ok: true }, true)
  assert.equal(hosted.length, 2); assert.match(hosted[1].text, /Optional host payload/)
  assert.equal(presentTitle('ERP index')({}, { content: [], isError: false }).title, 'ERP index')
  assert.equal(presentTitle('ERP index')({}, { content: [], isError: true }).title, 'ERP needs attention')
  assert.deepEqual(native.inject, ['tools', 'llm', 'agents', 'systemPrompt'])
  assert.equal('deskworkConfig' in native, false)
})

test('the installed tool catalog has no model-supplied frontier and the prompt carries the depth limit', async t => {
  const root = await mkdtemp(join(tmpdir(), 'erp-bfs-catalog-'))
  const host = await mount(plugin, undefined, { dataDir: join(root, 'data') })
  t.after(async () => { await host.dispose(); await rm(root, { recursive: true, force: true }) })
  const names = host.ctx.tools.schemas().map(tool => tool.name)
  for (const retired of ['erp_learning_start', 'erp_learning_extend', 'erp_learning_finish_unit']) assert.equal(names.includes(retired), false)
  for (const name of ['erp_learning_begin', 'erp_learning_accept', 'erp_index_read']) assert.equal(names.includes(name), true)
  assert.match(renderPrompt(await host.ctx.systemPrompt.assemble()), /depth 3/)
})
