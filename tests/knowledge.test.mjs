import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, mkdir, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { StorageClient, restoreBackup } from '../dist/storage/client.js'
import { StoreDatabase, migrations } from '../dist/storage/database.js'
import * as plugin from '../dist/index.js'
import { mount } from './harness.mjs'

const scope = { site: 'fixture', account: 'reader', tenant: 'tenant-a', role: 'reader' }
const evidence = [{ observationId: 'observation-1', quote: '采购 Purchasing' }]
const node = (id, kind = 'menu', extra = {}) => ({ id, kind, name: '采购 Purchasing', aliases: ['采购'], description: 'Visible purchasing entry',
  expectedVersion: 0, stage: 'observed', flags: [], lifecycle: 'active', evidence, dependencies: [], ...extra })
const link = (id, from, to, predicate = 'supports', extra = {}) => node(id, 'relation', { stage: 'interpreted',
  from: { id: from, version: 1 }, to: { id: to, version: 1 }, predicate, ...extra })
const claim = (extra = {}) => ({ scope, id: 'claim-1', target: { id: 'menu-1', version: 1 },
  proposition: 'The menu label is Purchasing', conditions: 'Fixture role and English locale', method: 'User reviewed the captured label',
  verdict: 'supported', evidence, ...extra })
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'erp-knowledge-')); const clients = []
  t.after(async () => { for (const client of clients) await client.dispose(); await rm(root, { recursive: true, force: true }) })
  const open = (directory = join(root, 'data')) => { const c = new StorageClient({ directory }); clients.push(c); return c }
  const client = open()
  await client.call('observe', { id: 'observation-1', scope, title: 'Fixture ERP', text: '采购 Purchasing 待审核 Pending',
    url: 'https://example.invalid/erp', locale: 'en', context: 'Navigation labels', observedAt: '2026-09-11T00:00:00.000Z',
    evidence: { mime: 'text/plain', base64: Buffer.from('fixture labels').toString('base64') } })
  return { root, client, open, commit: (records, origin = 'ai') => client.call('knowledgeCommit', { scope, records, origin }),
    get: (id, version) => client.call('knowledgeGet', { scope, id, ...(version ? { version } : {}) }) }
}
test('menu and domain maps stay separate, support many-to-many links, contexts and observed field samples', async t => {
  const f = await fixture(t)
  await f.commit([
    link('link-1', 'menu-1', 'domain-1'), link('link-2', 'menu-1', 'domain-2'), link('link-3', 'menu-2', 'domain-1'),
    node('menu-1'), node('menu-2'), node('domain-1', 'domain', { stage: 'interpreted' }), node('domain-2', 'domain', { stage: 'interpreted' }),
    node('page-1', 'page', { context: { url: 'https://example.invalid/erp?temporary=fixture', pageType: 'list', tab: 'Orders' } }),
    node('page-2', 'page', { context: { url: 'https://example.invalid/erp', pageType: 'detail', window: 'Order detail' } }),
    node('control-1', 'control'), node('control-2', 'control'),
    link('field-link-1', 'control-1', 'field-1', 'represents'), link('field-link-2', 'control-2', 'field-1', 'represents'),
    link('page-link-1', 'page-1', 'domain-1'), link('page-link-2', 'page-1', 'domain-2'),
    node('field-1', 'field', { definition: { valueType: 'string', observedValues: ['Pending'], completeness: 'unknown' } }),
  ])
  const neighbors = await f.client.call('knowledgeNeighbors', { scope, id: 'menu-1', direction: 'out', after: '', limit: 1 })
  assert.equal(neighbors.hasMore, true); assert.equal(neighbors.items.length, 1)
  const next = await f.client.call('knowledgeNeighbors', { scope, id: 'menu-1', direction: 'out', after: neighbors.nextAfter, limit: 1 })
  assert.equal(next.hasMore, false); assert.equal(next.items[0].record.id, 'link-2')
  assert.equal((await f.client.call('knowledgeNeighbors', { scope, id: 'domain-1', direction: 'in', after: '', limit: 50 })).items.length, 3)
  assert.equal((await f.client.call('knowledgeNeighbors', { scope, id: 'field-1', direction: 'in', predicate: 'represents', after: '', limit: 50 })).items.length, 2)
  assert.equal((await f.client.call('knowledgeNeighbors', { scope, id: 'page-1', direction: 'out', after: '', limit: 50 })).items.length, 2)
  assert.equal((await f.get('page-1')).record.context.url, 'https://example.invalid/erp')
  assert.equal((await f.get('field-1')).record.definition.completeness, 'unknown')
  assert.deepEqual((await f.get('link-1')).staleDependencies, [])
})
test('rename preserves identity and history; stale dependencies and confirmations stay pinned to exact revisions', async t => {
  const f = await fixture(t)
  await f.commit([node('menu-1'), node('domain-1', 'domain'), link('link-1', 'menu-1', 'domain-1')])
  await f.client.call('knowledgeVerify', claim())
  await f.commit([node('menu-1', 'menu', { expectedVersion: 1, name: '采购管理', aliases: ['Purchasing'], flags: ['needs-review'] })], 'user')
  assert.equal((await f.get('menu-1')).record.origin, 'user')
  assert.equal((await f.get('menu-1', 1)).record.origin, 'ai')
  assert.equal((await f.get('menu-1', 1)).verifications.length, 1)
  assert.equal((await f.get('menu-1')).verifications.length, 0)
  assert.deepEqual((await f.get('link-1')).staleDependencies, [{ id: 'menu-1', version: 1 }])
  await assert.rejects(f.commit([node('menu-1')]), { code: 'KNOWLEDGE_VERSION_CONFLICT' })
  await assert.rejects(f.commit([node('menu-1', 'domain', { expectedVersion: 2 })]), { code: 'KNOWLEDGE_KIND_IMMUTABLE' })
  const history = await f.client.call('knowledgeHistory', { scope, id: 'menu-1', afterVersion: 0, limit: 1 })
  assert.equal(history.hasMore, true)
  const next = await f.client.call('knowledgeHistory', { scope, id: 'menu-1', afterVersion: history.nextVersion, limit: 1 })
  assert.equal(next.items[0].record.version, 2); assert.equal(next.hasMore, false)
  await assert.rejects(f.client.call('knowledgeVerify', claim({ id: 'claim-stale' })), { code: 'KNOWLEDGE_VERIFICATION_TARGET_CHANGED' })
  const raw = await f.client.call('observation', { scope, id: 'observation-1' })
  assert.equal(raw.version, 1); assert.equal(raw.text, '采购 Purchasing 待审核 Pending')
  await f.commit([node('menu-1', 'menu', { expectedVersion: 2, lifecycle: 'retired' })])
  assert.equal((await f.get('link-1')).staleDependencies.length, 1)
  await f.commit([link('link-1', 'menu-1', 'domain-1', 'supports', { expectedVersion: 1, lifecycle: 'retired' })])
  assert.equal((await f.client.call('knowledgeNeighbors', { scope, id: 'menu-1', direction: 'out', after: '', limit: 10 })).items.length, 0)
  assert.equal((await f.get('link-1', 1)).record.lifecycle, 'active')
})
test('invalid citations, relation semantics and cycles roll back the entire batch', async t => {
  const f = await fixture(t)
  await f.commit([node('menu-1'), node('menu-2'), node('domain-1', 'domain')])
  for (const [record, code] of [
    [node('bad', 'menu', { evidence: [{ observationId: 'observation-1', quote: 'invented quote' }] }), 'KNOWLEDGE_QUOTE_NOT_FOUND'],
    [node('bad', 'menu', { evidence: [] }), 'KNOWLEDGE_OBSERVATION_REQUIRED'],
    [link('bad', 'menu-1', 'menu-2'), 'KNOWLEDGE_RELATION_KIND_MISMATCH'],
    [link('bad', 'menu-1', 'missing'), 'KNOWLEDGE_DEPENDENCY_NOT_CURRENT'],
    [link('bad', 'menu-1', 'domain-1', 'supports', { from: { id: 'menu-1', version: 2 } }), 'KNOWLEDGE_DEPENDENCY_NOT_CURRENT'],
    [node('bad', 'page'), 'KNOWLEDGE_PAGE_CONTEXT_REQUIRED'],
  ]) {
    await assert.rejects(f.commit([node('should-rollback'), record]), { code })
    assert.equal(await f.get('should-rollback'), null)
  }
  await assert.rejects(f.commit([link('cycle-a', 'menu-1', 'menu-2', 'contains'), link('cycle-b', 'menu-2', 'menu-1', 'contains')]), { code: 'KNOWLEDGE_CONTAINMENT_CYCLE' })
  assert.equal(await f.get('cycle-a'), null)
  assert.equal((await f.client.call('check', {})).databaseOk, true)
})
test('full scope isolates IDs, evidence, verification and search; native schema rejects authority and executable definitions', async t => {
  const f = await fixture(t); await f.commit([node('menu-1')])
  for (const key of ['site', 'account', 'tenant', 'role']) {
    const other = { ...scope, [key]: 'other' }
    assert.equal(await f.client.call('knowledgeGet', { scope: other, id: 'menu-1' }), null)
    assert.equal((await f.client.call('knowledgeSearch', { scope: other, query: '采购', after: '', limit: 10 })).items.length, 0)
    await assert.rejects(f.client.call('knowledgeCommit', { scope: other, records: [node('menu-1')], origin: 'ai' }), { code: 'KNOWLEDGE_EVIDENCE_NOT_FOUND' })
    await assert.rejects(f.client.call('knowledgeVerify', claim({ scope: other })), { code: 'KNOWLEDGE_VERIFICATION_TARGET_CHANGED' })
    await f.client.call('knowledgeCommit', { scope: other, records: [node('menu-1', 'menu', { stage: 'discovered', evidence: [] })], origin: 'ai' })
  }
  for (const extra of [{ stage: 'verified' }, { origin: 'user' }, { kind: 'business-instance' }, { definition: { valueType: 'string', observedValues: [], completeness: 'complete' } },
    { definition: { valueType: 'string', observedValues: [], completeness: 'unknown', code: 'z.enum([])' } }]) {
    await assert.rejects(f.commit([node('invalid', 'field', extra)]), { code: 'INVALID_STORAGE_MESSAGE' })
  }
  await assert.rejects(f.commit([node('invalid', 'field', { definition: { valueType: 'number', observedValues: ['Pending'], completeness: 'unknown' } })]), { code: 'KNOWLEDGE_VALUE_TYPE_MISMATCH' })
})
test('alias search, pagination and derived index rebuilding preserve knowledge after restart and restore', async t => {
  const f = await fixture(t)
  await f.commit([node('menu-1'), node('domain-1', 'domain'), link('link-1', 'menu-1', 'domain-1')])
  await f.client.call('knowledgeVerify', claim())
  const backup = await f.client.call('backup', {}); const destination = join(f.root, 'restored')
  await restoreBackup(f.client.directory, backup.id, destination)
  let client = f.open(destination)
  assert.equal((await client.call('knowledgeGet', { scope, id: 'menu-1' })).verifications.length, 1)
  assert.equal((await client.call('check', {})).databaseOk, true)
  for (const query of ['采购', 'Purchasing']) {
    const first = await client.call('knowledgeSearch', { scope, query, after: '', limit: 2 })
    const next = await client.call('knowledgeSearch', { scope, query, after: first.nextAfter, limit: 2 })
    assert.equal(first.hasMore, true); assert.equal(next.hasMore, false)
    assert.deepEqual([...first.items, ...next.items].map(v => v.record.id), ['domain-1', 'link-1', 'menu-1'])
  }
  await client.dispose()
  const db = new DatabaseSync(join(destination, 'store.sqlite')); db.exec('DELETE FROM knowledge_fts'); db.close()
  client = f.open(destination)
  assert.equal((await client.call('knowledgeSearch', { scope, query: 'Purchasing', after: '', limit: 10 })).items.length, 0)
  await client.call('rebuildIndex', {})
  assert.equal((await client.call('knowledgeSearch', { scope, query: 'Purchasing', after: '', limit: 10, kind: 'menu' })).items.length, 1)
})
test('v2 upgrade preserves observations and checkpoints; failed v3 migration restores v2 atomically', async t => {
  const root = await mkdtemp(join(tmpdir(), 'erp-upgrade-')); t.after(() => rm(root, { recursive: true, force: true }))
  for (const failure of [false, true]) {
    const directory = join(root, String(failure)); await mkdir(directory)
    const db = new DatabaseSync(join(directory, 'store.sqlite')); db.exec(migrations[0]); db.exec(migrations[1]); db.exec('PRAGMA user_version=2')
    const sk = JSON.stringify([scope.site, scope.account, scope.tenant, scope.role])
    db.prepare('INSERT INTO observations(id,scope,payload,fingerprint) VALUES(?,?,?,?)').run('old', sk, JSON.stringify({ id: 'old', scope, title: 'Old', text: 'Purchasing', version: 1, url: 'https://example.invalid/', locale: 'en', context: 'old', observedAt: '2026-09-11T00:00:00Z' }), 'fixture')
    db.prepare('INSERT INTO tasks(id,scope,version,payload) VALUES(?,?,?,?)').run('round-1', sk, 1, JSON.stringify({ id: 'round-1', scope, version: 1, state: 'paused', frontier: ['menu-1'], cursor: {}, reason: '' }))
    db.close()
    const store = new StoreDatabase(directory, failure ? [...migrations.slice(0, 2), `${migrations[2]} INVALID SQL;`] : migrations)
    if (failure) await assert.rejects(store.open(), { code: 'MIGRATION_FAILED_ORIGINAL_RETAINED' })
    else {
      await store.open()
      try {
        assert.equal((await store.execute('status', {})).schemaVersion, 3)
        assert.equal((await store.execute('observation', { scope, id: 'old' })).text, 'Purchasing')
        assert.deepEqual((await store.execute('task', { scope, id: 'round-1' })).frontier, ['menu-1'])
        assert.equal((await store.execute('knowledgeSearch', { scope, query: 'Purchasing', after: '', limit: 10 })).items.length, 0)
      } finally { store.close() }
    }
    const [backup] = await readdir(join(directory, 'backups'))
    assert.equal(JSON.parse(await readFile(join(directory, 'backups', backup, 'manifest.json'), 'utf8')).schemaVersion, 2)
    const check = new DatabaseSync(join(directory, 'store.sqlite'))
    try {
      assert.equal(check.prepare('PRAGMA user_version').get().user_version, failure ? 2 : 3)
      assert.equal(check.prepare('SELECT count(*) AS n FROM observations').get().n, 1)
      if (failure) assert.equal(check.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='knowledge_records'").get().n, 0)
    } finally { check.close() }
  }
})
function agent() {
  const events = [{ type: 'turn/start' }]
  return { session: { get seq() { return events.length }, eventAt(seq) { return events[seq] }, append(type, data) { const e = { type, data }; events.push(e); return e } } }
}
test('native tools accumulate AI knowledge without asking; user attribution needs exact host approval and rejects stale confirmation', async t => {
  const root = await mkdtemp(join(tmpdir(), 'erp-knowledge-tools-'))
  const host = await mount(plugin, undefined, { dataDir: join(root, 'data') })
  t.after(async () => { await host.dispose(); await rm(root, { recursive: true, force: true }) })
  const input = { scope, records: [node('menu-1', 'menu', { stage: 'interpreted', evidence: [] })] }
  const requests = []; let answer = 'allowed-once'; let concurrentEdit = false
  host.ctx.on('approval/request', async request => {
    requests.push(request)
    if (concurrentEdit) await host.ctx.erp.storage.call('knowledgeCommit', { ...input, records: [{ ...input.records[0], expectedVersion: 2 }], origin: 'ai' })
    return answer
  })
  const run = (name, args) => host.run(name, args, { agent: agent() })
  assert.equal((await run('erp_knowledge_record', input)).isError, false)
  assert.equal(requests.length, 0)
  assert.equal((await run('erp_knowledge_record', { ...input, origin: 'user' })).isError, true)
  const correction = { ...input, records: [{ ...input.records[0], expectedVersion: 1, description: 'User corrected interpretation' }] }
  assert.equal((await host.run('erp_knowledge_correct', correction)).isError, true)
  answer = 'rejected'; assert.equal((await run('erp_knowledge_correct', correction)).isError, true)
  assert.equal((await run('erp_knowledge_get', { scope, id: 'menu-1' })).value.record.origin, 'ai')
  answer = 'allowed-once'; assert.equal((await run('erp_knowledge_correct', correction)).isError, false)
  assert.equal((await run('erp_knowledge_get', { scope, id: 'menu-1' })).value.record.origin, 'user')
  const confirmation = claim({ target: { id: 'menu-1', version: 2 }, evidence: [] })
  assert.equal((await host.run('erp_knowledge_confirm', confirmation)).isError, true)
  const confirmed = await run('erp_knowledge_confirm', confirmation)
  assert.equal(confirmed.isError, false, JSON.stringify(confirmed))
  assert.equal(confirmed.value.origin, 'user-confirmation')
  assert.equal((await run('erp_knowledge_get', { scope, id: 'menu-1' })).value.record.stage, 'interpreted')
  concurrentEdit = true
  assert.equal((await run('erp_knowledge_confirm', { ...confirmation, id: 'claim-stale' })).isError, true)
  assert.equal((await run('erp_knowledge_get', { scope, id: 'menu-1', version: 2 })).value.verifications.length, 1)
  assert.ok(JSON.stringify(requests).includes('User corrected interpretation'))
})

test('bounded verification summaries expose truncation and full paginated refutations', async t => {
  const f = await fixture(t); await f.commit([node('menu-1')])
  for (let i = 0; i < 12; i++) await f.client.call('knowledgeVerify', claim({ id: `claim-${String(i).padStart(2, '0')}`, verdict: i % 2 ? 'refuted' : 'supported' }))
  const view = await f.get('menu-1')
  assert.equal(view.verifications.length, 10); assert.equal(view.verificationsTruncated, true)
  assert.deepEqual(view.record.scope, scope)
  const first = await f.client.call('knowledgeVerifications', { scope, id: 'menu-1', version: 1, after: '', limit: 10 })
  const next = await f.client.call('knowledgeVerifications', { scope, id: 'menu-1', version: 1, after: first.nextAfter, limit: 10 })
  assert.equal(first.hasMore, true); assert.equal(next.hasMore, false)
  assert.equal([...first.items, ...next.items].filter(v => v.verdict === 'refuted').length, 6)
  assert.equal((await f.get('menu-1')).record.stage, 'observed')
  assert.deepEqual(first.items[0].scope, scope)
  await assert.rejects(f.client.call('knowledgeVerify', claim({ id: 'claim-00' })), { code: 'KNOWLEDGE_VERIFICATION_ID_CONFLICT' })
})
