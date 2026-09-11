import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, readFile, writeFile, readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { StorageClient, restoreBackup } from '../dist/storage/client.js'
import { StoreDatabase, migrations } from '../dist/storage/database.js'

const scope = { site: 'fixture', account: 'reader', tenant: 'tenant-a', role: 'read-only' }
const observation = (id = 'obs-1', overrides = {}) => ({ id, scope, title: '采购订单 Purchase Order', text: '采购订单状态为待收货，field meaning remains an observation.',
  url: 'https://example.invalid/erp?token=test-only#/purchase?session=test-only', locale: 'zh-CN', context: 'list', observedAt: '2026-09-11T00:00:00.000Z',
  evidence: { mime: 'text/plain', base64: Buffer.from('redacted fixture evidence').toString('base64') }, ...overrides })
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'erp-storage-'))
  const directory = join(root, 'data')
  const clients = []
  t.after(async () => { for (const c of clients) await c.dispose(); await rm(root, { recursive: true, force: true }) })
  const open = (dir = directory) => { const client = new StorageClient({ directory: dir }); clients.push(client); return client }
  return { root, directory, open }
}
async function seedV1(directory) {
  await mkdir(directory, { recursive: true })
  const db = new DatabaseSync(join(directory, 'store.sqlite'))
  db.exec(migrations[0]); db.exec('PRAGMA user_version=1')
  const { evidence, ...input } = observation()
  const stored = { ...input, version: 1 }
  const payload = JSON.stringify(stored)
  db.prepare('INSERT INTO observations(id,scope,payload,fingerprint,evidence_hash) VALUES(?,?,?,?,null)')
    .run(input.id, JSON.stringify([scope.site, scope.account, scope.tenant, scope.role]), payload, createHash('sha256').update(payload).digest('hex'))
  db.close()
}

test('lazy store, immutable scoped observations, evidence and restart persistence', async t => {
  const f = await fixture(t); let client = f.open()
  assert.equal(existsSync(f.directory), false)
  const input = observation()
  const saved = await client.call('observe', input)
  assert.equal(saved.url, 'https://example.invalid/erp#/purchase')
  assert.equal(saved.evidenceHash.length, 64)
  const reordered = { ...input, scope: { role: scope.role, tenant: scope.tenant, account: scope.account, site: scope.site } }
  assert.deepEqual(await client.call('observe', reordered), saved)
  await assert.rejects(client.call('observe', { ...input, text: 'different' }), { code: 'OBSERVATION_ID_CONFLICT' })
  assert.equal(await client.call('observation', { id: input.id, scope: { ...scope, tenant: 'other' } }), null)
  await client.dispose(); client = f.open()
  assert.deepEqual(await client.call('observation', { id: input.id, scope }), saved)
  assert.deepEqual(await client.call('check', {}), { databaseOk: true, missing: [], corrupt: [], orphaned: [] })
  assert.equal((await readFile(join(f.directory, 'evidence', saved.evidenceHash), 'utf8')), 'redacted fixture evidence')
})
test('SQLite rejects a second owner without blocking the host event loop', async t => {
  const f = await fixture(t); const owner = f.open(); await owner.call('status', {})
  const contender = f.open(); let ticks = 0
  const timer = setInterval(() => ticks++, 5)
  try { await assert.rejects(contender.call('status', {}), { code: 'STORAGE_ALREADY_OPEN' }) } finally { clearInterval(timer) }
  assert.ok(ticks >= 10, `host only ticked ${ticks} times during SQLite lock wait`)
  await owner.dispose()
  const next = f.open(); assert.equal((await next.call('status', {})).lockingMode, 'exclusive')
})
test('scope-qualified Chinese/English search and rebuilding derived index', async t => {
  const f = await fixture(t); let client = f.open()
  await client.call('observe', observation())
  await client.call('observe', observation('obs-2', { scope: { ...scope, account: 'another-account' } }))
  for (const query of ['采购', '采购订单', 'Purchase Order']) {
    assert.deepEqual((await client.call('search', { scope, query, limit: 10 })).map(x => x.id), ['obs-1'])
  }
  await assert.rejects(client.call('search', { scope, query: 'a', limit: 1000 }), { code: 'INVALID_SEARCH' })
  assert.deepEqual(await client.call('search', { scope, query: 'no"such', limit: 10 }), [])
  await client.dispose()
  const db = new DatabaseSync(join(f.directory, 'store.sqlite')); db.exec('DELETE FROM observations_fts'); db.close()
  client = f.open(); assert.deepEqual(await client.call('search', { scope, query: '采购订单', limit: 10 }), [])
  await client.call('rebuildIndex', {})
  assert.equal((await client.call('search', { scope, query: '采购订单', limit: 10 })).length, 1)
})
test('checkpoint compare-and-set and interrupted round recovery preserve frontier', async t => {
  const f = await fixture(t); let client = f.open()
  const task = { id: 'round-1', scope, expectedVersion: 0, state: 'running', frontier: ['products', 'purchasing'], cursor: { level: 'L1', visited: [] }, reason: '' }
  assert.equal((await client.call('checkpoint', task)).version, 1)
  await assert.rejects(client.call('checkpoint', task), { code: 'CHECKPOINT_CONFLICT' })
  assert.equal(await client.call('task', { id: task.id, scope: { ...scope, role: 'other' } }), null)
  await client.dispose(); client = f.open()
  const recovered = await client.call('task', { id: task.id, scope })
  assert.equal(recovered.state, 'paused'); assert.equal(recovered.reason, 'storage-restarted'); assert.equal(recovered.version, 2)
  assert.deepEqual(recovered.frontier, task.frontier); assert.deepEqual(recovered.cursor, task.cursor)
})
test('WAL backup captures a consistent boundary, evidence and recoverable standalone database', async t => {
  const f = await fixture(t); const client = f.open()
  const one = await client.call('observe', observation())
  assert.ok((await stat(join(f.directory, 'store.sqlite-wal'))).size > 0)
  const backing = client.call('backup', {})
  const following = client.call('observe', observation('after-backup'))
  const result = await backing; await following
  const destination = join(f.root, 'restored')
  await restoreBackup(f.directory, result.id, destination)
  const restored = f.open(destination)
  assert.equal((await restored.call('status', {})).observations, 1)
  assert.deepEqual(await restored.call('observation', { scope, id: 'obs-1' }), one)
  assert.equal((await client.call('status', {})).observations, 2)
  await assert.rejects(restoreBackup(f.directory, result.id, destination), { code: 'RESTORE_DESTINATION_UNAVAILABLE' })
  assert.equal((await restored.call('status', {})).observations, 1)
})
test('offline restore works when the original database is corrupt, and rejects tampered backup', async t => {
  const f = await fixture(t); const client = f.open()
  await client.call('observe', observation()); const backup = await client.call('backup', {}); await client.dispose()
  await writeFile(join(f.directory, 'store.sqlite'), 'not a sqlite database')
  await restoreBackup(f.directory, backup.id, join(f.root, 'rescued'))
  assert.equal((await f.open(join(f.root, 'rescued')).call('status', {})).observations, 1)
  const snapshot = join(f.directory, 'backups', backup.id, 'store.sqlite')
  await writeFile(snapshot, 'tampered')
  await assert.rejects(restoreBackup(f.directory, backup.id, join(f.root, 'bad')), { code: 'BACKUP_INVALID' })
  assert.equal(existsSync(join(f.root, 'bad')), false)
})
test('migration backs up the old version then builds the new searchable index', async t => {
  const f = await fixture(t); await seedV1(f.directory)
  const client = f.open(); assert.equal((await client.call('status', {})).schemaVersion, 3)
  assert.equal((await client.call('search', { scope, query: '采购订单', limit: 10 })).length, 1)
  const [id] = await readdir(join(f.directory, 'backups'))
  const manifest = JSON.parse(await readFile(join(f.directory, 'backups', id, 'manifest.json'), 'utf8'))
  assert.equal(manifest.schemaVersion, 1)
  const before = new DatabaseSync(join(f.directory, 'backups', id, 'store.sqlite'), { readOnly: true })
  try { assert.equal(before.prepare('PRAGMA user_version').get().user_version, 1); assert.equal(before.prepare('SELECT count(*) AS n FROM observations').get().n, 1) }
  finally { before.close() }
})
test('failed migration rolls back schema and data and preserves a verified backup', async t => {
  const f = await fixture(t); await seedV1(f.directory)
  const store = new StoreDatabase(f.directory, [migrations[0], 'CREATE TABLE partial(id INTEGER); INVALID SQL;'])
  await assert.rejects(store.open(), { code: 'MIGRATION_FAILED_ORIGINAL_RETAINED' })
  const original = new DatabaseSync(join(f.directory, 'store.sqlite'))
  try {
    assert.equal(original.prepare('PRAGMA user_version').get().user_version, 1)
    assert.equal(original.prepare('SELECT count(*) AS n FROM observations').get().n, 1)
    assert.equal(original.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='partial'").get().n, 0)
  } finally { original.close() }
  assert.equal((await readdir(join(f.directory, 'backups'))).length, 1)
})
test('future schema is rejected without replacing user data', async t => {
  const f = await fixture(t); await seedV1(f.directory)
  const original = new DatabaseSync(join(f.directory, 'store.sqlite')); original.exec('PRAGMA user_version=99'); original.close()
  await assert.rejects(f.open().call('status', {}), { code: 'DATABASE_VERSION_TOO_NEW' })
  const check = new DatabaseSync(join(f.directory, 'store.sqlite')); assert.equal(check.prepare('PRAGMA user_version').get().user_version, 99); check.close()
})
test('evidence consistency reports corruption/missing/orphans and blocks incomplete backups', async t => {
  const f = await fixture(t); const client = f.open(); const saved = await client.call('observe', observation())
  const path = join(f.directory, 'evidence', saved.evidenceHash)
  await writeFile(path, 'bad bytes')
  assert.deepEqual((await client.call('check', {})).corrupt, [saved.evidenceHash])
  await assert.rejects(client.call('backup', {}))
  assert.deepEqual(await readdir(join(f.directory, 'backups')), [])
  await rm(path)
  await writeFile(join(f.directory, 'evidence', 'orphan.tmp'), 'partial write')
  const report = await client.call('check', {})
  assert.deepEqual(report.missing, [saved.evidenceHash]); assert.deepEqual(report.orphaned, ['orphan.tmp'])
})
test('queued cancellation causes no write; admitted inputs are snapshotted; dispose drains writes', async t => {
  const f = await fixture(t); const client = f.open()
  const abort = new AbortController(); const cancelled = client.call('observe', observation('cancelled'), abort.signal); abort.abort()
  await assert.rejects(cancelled)
  const input = observation('saved'); const saving = client.call('observe', input); input.text = 'mutated after submission'
  await client.dispose(); assert.notEqual((await saving).text, input.text)
  await assert.rejects(client.call('status', {}), { code: 'STORAGE_CLOSED' })
  const next = f.open(); assert.equal((await next.call('status', {})).observations, 1)
})
test('storage worker crash requires explicit reopening and retains committed records', async t => {
  const f = await fixture(t); const client = f.open()
  await client.call('observe', observation())
  await client.thread.terminate()
  await assert.rejects(client.call('status', {}), { code: 'STORAGE_WORKER_EXITED' })
  assert.equal((await f.open().call('status', {})).observations, 1)
})
test('large evidence roundtrips and malformed or excessive admissions fail without writes', async t => {
  const f = await fixture(t); const client = f.open()
  const evidence = { mime: 'text/plain', base64: Buffer.alloc(2_000_000, 65).toString('base64') }
  const saved = await client.call('observe', observation('large', { evidence }))
  assert.equal((await readFile(join(f.directory, 'evidence', saved.evidenceHash))).length, 2_000_000)
  await assert.rejects(client.call('observe', observation('bad', { evidence: { ...evidence, base64: 'AB==' } })), { code: 'INVALID_EVIDENCE' })
  await assert.rejects(client.call('observe', observation('bad', { url: 'https://user:password@example.invalid/' })), { code: 'INVALID_OBSERVATION_URL' })
  await assert.rejects(client.call('observe', { ...observation('bad'), password: 'fixture-invalid-field' }), { code: 'INVALID_STORAGE_MESSAGE' })
  const batch = Array.from({ length: 16 }, (_, i) => client.call('observe', observation(`queued-${i}`)))
  await assert.rejects(client.call('observe', observation('overflow')), { code: 'STORAGE_QUEUE_FULL' })
  await Promise.all(batch)
  assert.equal((await client.call('status', {})).observations, 17)
})
test('data directory rejects relative paths and known sync folders with controlled errors', async t => {
  const f = await fixture(t)
  await assert.rejects(f.open('relative-directory').call('status', {}), { code: 'LOCAL_DATA_DIRECTORY_REQUIRED' })
  await assert.rejects(f.open(join(f.root, 'Dropbox', 'erp')).call('status', {}), { code: 'SYNC_DIRECTORY_UNSUPPORTED' })
})
