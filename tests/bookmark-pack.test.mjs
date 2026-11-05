import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { StorageClient } from '../dist/storage/client.js'
import { SiteCatalog } from '../dist/sites/catalog.js'
import { LearningRuntime } from '../dist/learning/runtime.js'
import { normalizeBookmark } from '../dist/product/bookmark.js'
import { loggedInUiVisible, startExplore } from '../dist/learning/explore.js'
import { runExploreCommand } from '../dist/product/commands.js'
import { exportSharePack, importSharePack } from '../dist/knowledge/pack.js'
import { unzipArchive, zipArchive } from '../dist/knowledge/zip.js'
import { erpRequest } from '../dist/product/api.js'

const signal = () => new AbortController().signal
const sender = { site: 'sender-system', account: 'sender-account', tenant: 'sender-tenant' }
const receiver = { site: 'receiver-system', account: 'receiver-account' }

test('bookmark normalization drops secrets and keeps a hash home', () => {
  assert.equal(normalizeBookmark('https://user:secret@erp.example/app/orders/15?token=abc#code=1').entryUrl, 'https://erp.example/app/')
  assert.equal(normalizeBookmark('https://erp.example/web/#/home?code=1').entryUrl, 'https://erp.example/web/#/home')
  assert.equal(normalizeBookmark('https://erp.example/web/#/orders/9').baseUrl, 'https://erp.example/web/')
  assert.equal(normalizeBookmark('https://erp.example/oauth/callback?code=1&state=2').entryUrl, 'https://erp.example/')
  assert.throws(() => normalizeBookmark('file:///tmp/erp'), /INVALID_ENTRY_URL/)
})

test('an existing identity keeps its persistent ids when a deep link reloads', async t => {
  const root = mkdtempSync(join(tmpdir(), 'erp-bookmark-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const first = new SiteCatalog(root, { system: { url: 'https://a.example/app/', account: 'one', tenant: 'acme', role: 'buyer', name: 'Alpha' } })
  const saved = first.list()[0]
  await first.dispose()
  const again = new SiteCatalog(root, { system: { url: 'https://a.example/app/orders/9?token=abc', account: 'one', tenant: 'acme', role: 'buyer' } })
  t.after(() => again.dispose())
  assert.equal(again.list()[0].id, saved.id)
  assert.equal(again.list()[0].profile.id, saved.profile.id)
  assert.equal(again.list()[0].profile.scope.account, 'one')
  assert.equal(again.list()[0].profile.entryUrl, 'https://a.example/app/')
  assert.equal(existsSync(again.list()[0].workspaceDir), true)
})

test('desktop add stores the normalized bookmark and ignores identity fields', async t => {
  const root = mkdtempSync(join(tmpdir(), 'erp-bookmark-add-'))
  const catalog = new SiteCatalog(root)
  t.after(() => { rmSync(root, { recursive: true, force: true }); return catalog.dispose() })
  const added = erpRequest(catalog, { op: 'add', url: 'https://user:pw@b.example/app/records/8?token=1', name: 'Beta', account: 'buyer', baseUrl: 'https://evil.example/' })
  assert.equal(added.ok, true)
  assert.equal(added.value.sites[0].entryUrl, 'https://b.example/app/')
  assert.equal(added.value.sites[0].account, 'default')
  assert.doesNotMatch(readFileSync(join(catalog.root, 'catalog.json'), 'utf8'), /token|buyer|evil\.example|user:pw/)
  const renamed = erpRequest(catalog, { op: 'update', id: added.value.sites[0].id, url: 'https://b.example/app/login', name: 'Renamed' })
  assert.equal(renamed.value.sites[0].id, added.value.sites[0].id)
  assert.equal(renamed.value.sites[0].name, 'Renamed')
})

function snap(url, title, controls) {
  return { sessionId: 's', revision: 1, snapshotId: 'snap', url, title, observedAt: '2026-11-04T00:00:00.000Z',
    frames: [{ url, title, text: title }], controls, limitations: ['test'] }
}
const control = extra => ({ ref: '1', context: '', value: '', inputType: '', disabled: false, options: [], group: '', href: '', frameUrl: 'https://example.test/app/', ...extra })

test('explore persists a paused round until a logged-in page is visible', async t => {
  const root = await mkdtemp(join(tmpdir(), 'erp-explore-'))
  const client = new StorageClient({ directory: join(root, 'data') })
  t.after(async () => { await client.dispose(); await rm(root, { recursive: true, force: true }) })
  const scope = { site: 'example.test', account: 'reader' }
  const runtime = new LearningRuntime(client)
  assert.equal(loggedInUiVisible(undefined), false)
  const paused = await startExplore(runtime, scope, signal())
  assert.equal(paused.state, 'paused')
  assert.equal(paused.pausedUntilLogin, true)
  assert.equal(paused.complete, false)
  assert.equal((await runtime.status(scope, 'explore', signal())).state, 'paused')
  const login = snap('https://example.test/app/', 'Sign in', [control({ kind: 'field', name: 'Password', inputType: 'password' })])
  await client.call('observe', { id: 'login-page', scope, url: login.url, title: login.title, text: JSON.stringify(login), locale: 'en',
    context: JSON.stringify({ source: 'browser-learning-v1' }), observedAt: login.observedAt })
  const still = await startExplore(runtime, scope, signal(), { id: 'login-page', text: JSON.stringify(login) })
  assert.equal(still.pausedUntilLogin, true)
  assert.equal(still.complete, false)
  assert.equal((await client.call('knowledgeSearch', { scope, query: '', after: '', limit: 20 })).items.length, 0)
  const home = snap('https://example.test/app/', 'Home', [control({ kind: 'menuitem', name: 'Orders', group: 'navigation', href: 'https://example.test/app/orders' })])
  await client.call('observe', { id: 'home-page', scope, url: home.url, title: home.title, text: JSON.stringify(home), locale: 'en',
    context: JSON.stringify({ source: 'browser-learning-v1' }), observedAt: home.observedAt })
  const started = await startExplore(runtime, scope, signal(), { id: 'home-page', text: JSON.stringify(home) })
  assert.equal(started.pausedUntilLogin, false)
  assert.equal(started.complete, false)
  assert.equal(started.state, 'running')
  const found = await client.call('knowledgeSearch', { scope, query: 'Orders', after: '', limit: 20 })
  assert.equal(found.items.some(item => item.record.name === 'Orders'), true)
  const replaced = await startExplore(runtime, scope, signal(), undefined, true)
  assert.equal(replaced.pausedUntilLogin, true)
  assert.equal(replaced.state, 'paused')
  assert.ok(replaced.version > started.version)
})

test('slash explore pauses without a login and refuses a conversation with no workspace', async t => {
  const root = await mkdtemp(join(tmpdir(), 'erp-slash-'))
  const catalog = new SiteCatalog(join(root, 'data'), { system: { url: 'https://erp.example/app/', name: 'Alpha' } })
  t.after(async () => { await catalog.dispose(); await rm(root, { recursive: true, force: true }) })
  const site = catalog.list()[0]
  const agent = { session: { id: 'sess-1', header: { id: 'sess-1', cwd: site.workspaceDir } } }
  const signal = AbortSignal.timeout(5_000)
  const paused = await runExploreCommand(catalog, { agent, signal }, false)
  assert.equal(paused.kind, 'success')
  assert.match(paused.text, /探索已暂停/)
  assert.match(paused.text, /paused/)
  const updated = await runExploreCommand(catalog, { agent, signal }, true)
  assert.equal(updated.kind, 'success')
  assert.match(updated.text, /覆盖/)
  assert.match(updated.text, /covers the previous explore/)
  const loose = await runExploreCommand(catalog, { agent: { session: { id: 'sess-2', header: { id: 'sess-2' } } }, signal }, false)
  assert.equal(loose.kind, 'error')
  assert.match(loose.text, /工作区/)
})

test('a share pack round-trips schemaVersion 1 and refuses a newer pack', async t => {
  const root = await mkdtemp(join(tmpdir(), 'erp-pack-'))
  const first = new StorageClient({ directory: join(root, 'sender') })
  const second = new StorageClient({ directory: join(root, 'receiver') })
  t.after(async () => { await Promise.all([first.dispose(), second.dispose()]); await rm(root, { recursive: true, force: true }) })
  await first.call('observe', { id: 'private-observation', scope: sender, url: 'https://private.example/app/', title: 'Private', text: 'secret-business-value',
    locale: 'en', context: 'private', observedAt: '2026-11-04T00:00:00.000Z' })
  await first.call('knowledgeCommit', { scope: sender, origin: 'user', records: [
    { id: 'private-menu', kind: 'menu', name: 'Purchasing', aliases: ['采购'], description: 'Review the list.', expectedVersion: 0, stage: 'observed', flags: [], lifecycle: 'active', evidence: [{ observationId: 'private-observation', quote: 'secret-business-value' }], dependencies: [], context: { url: 'https://private.example/app/', pageType: 'list' } },
    { id: 'private-field', kind: 'field', name: 'Vendor', aliases: [], description: 'Vendor name.', expectedVersion: 0, stage: 'interpreted', flags: ['needs-review'], lifecycle: 'active', evidence: [], dependencies: [], definition: { valueType: 'string', observedValues: ['private-customer-number'], completeness: 'unknown' } },
  ] })
  const exported = await exportSharePack(first, sender, { entryUrl: 'https://user:secret@private.example/app/orders/1?token=abc', name: 'Private ERP', workspaceId: 'site_private' }, signal())
  assert.equal(exported.records, 2)
  const files = unzipArchive(exported.bytes)
  const manifest = JSON.parse(files.get('manifest.json').toString('utf8'))
  assert.equal(manifest.format, 'dsh-erp-share-pack')
  assert.equal(manifest.schemaVersion, 1)
  assert.equal(manifest.producer.app, '@guosheng_047/dsh-erp')
  assert.equal(manifest.site.entryUrl, 'https://private.example/app/')
  assert.equal(manifest.site.name, 'Private ERP')
  assert.equal(manifest.site.workspaceId, 'site_private')
  assert.deepEqual(Object.keys(manifest.site).sort(), ['entryUrl', 'name', 'workspaceId'])
  assert.equal(manifest.inventory[0].path, 'knowledge.jsonl')
  const jsonl = files.get('knowledge.jsonl').toString('utf8')
  for (const secret of ['sender-account', 'sender-tenant', 'secret-business-value', 'private-observation', 'private-customer-number', 'user:secret', 'token=abc']) assert.equal(jsonl.includes(secret), false, secret)
  assert.match(jsonl, /"schemaVersion":1/)
  assert.match(jsonl, /"kind":"menu"/)
  const received = await importSharePack(second, receiver, exported.bytes, signal())
  assert.equal(received.imported, 2)
  assert.equal(received.scope.account, 'receiver-account')
  const all = await second.call('knowledgeSearch', { scope: receiver, query: '', after: '', limit: 20 })
  assert.equal(all.items.length, 2)
  for (const view of all.items) {
    assert.equal(view.record.stage, 'interpreted')
    assert.deepEqual(view.record.flags, ['needs-review'])
    assert.deepEqual(view.record.evidence, [])
    assert.deepEqual(view.record.scope, receiver)
  }
  const lines = jsonl.trim().split('\n')
  lines.push(JSON.stringify({ format: 'dsh-erp-share-record', schemaVersion: 1, kind: 'widget', version: 1, id: 'item-0099', name: 'Widget', extra: true }))
  const mixed = Buffer.from(`${lines.join('\n')}\n`)
  const { createHash } = await import('node:crypto')
  const mixedManifest = { ...manifest, inventory: [{ path: 'knowledge.jsonl', sha256: createHash('sha256').update(mixed).digest('hex'), records: 3 }] }
  const mixedZip = zipArchive([
    { name: 'manifest.json', data: Buffer.from(JSON.stringify(mixedManifest)) },
    { name: 'knowledge.jsonl', data: mixed },
    { name: 'run.js', data: Buffer.from('process.exit(1)') },
  ])
  const warned = await importSharePack(second, receiver, mixedZip, signal())
  assert.equal(warned.skipped.some(item => item.kind === 'widget' && item.warning === 'unknown-kind'), true)
  assert.equal(existsSync(join(second.directory, 'run.js')), false)
  const newer = { ...manifest, schemaVersion: 2 }
  const newerZip = zipArchive([
    { name: 'manifest.json', data: Buffer.from(JSON.stringify(newer)) },
    { name: 'knowledge.jsonl', data: files.get('knowledge.jsonl') },
  ])
  await assert.rejects(importSharePack(second, receiver, newerZip, signal()), /SHARE_PACK_VERSION/)
  assert.equal((await second.call('knowledgeSearch', { scope: receiver, query: '', after: '', limit: 20 })).items.length, 2)
  const hostile = { ...manifest, site: { ...manifest.site, entryUrl: 'https://user:pw@private.example/app/' } }
  const hostileZip = zipArchive([
    { name: 'manifest.json', data: Buffer.from(JSON.stringify(hostile)) },
    { name: 'knowledge.jsonl', data: files.get('knowledge.jsonl') },
  ])
  await assert.rejects(importSharePack(second, receiver, hostileZip, signal()), /ERP_PASSWORD_REJECTED/)
})
