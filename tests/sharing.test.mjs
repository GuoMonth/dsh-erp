import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import Skills from '@deepseek-ai/dsh-skill'
import * as FileSkills from '@deepseek-ai/dsh-skill-filesystem'
import { StorageClient } from '../dist/storage/client.js'
import { ExperienceSharing } from '../dist/knowledge/sharing.js'

const sender = { site: 'private-erp.example', account: 'sender-account', tenant: 'sender-tenant' }
const receiver = { site: 'receiver-erp.example', account: 'receiver-account', role: 'reader' }
const node = (id, kind = 'menu', extra = {}) => ({ id, kind, name: 'Purchasing', aliases: ['采购'], description: 'Review the list and validate the outcome.',
  expectedVersion: 0, stage: 'interpreted', flags: [], lifecycle: 'active', evidence: [], dependencies: [], ...extra })
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'erp-sharing-'))
  const first = new StorageClient({ directory: join(root, 'sender'), scope: sender })
  const second = new StorageClient({ directory: join(root, 'receiver'), scope: receiver })
  t.after(async () => { await Promise.all([first.dispose(), second.dispose()]); await rm(root, { recursive: true, force: true }) })
  return { root, first, second, export: new ExperienceSharing(first), import: new ExperienceSharing(second) }
}
test('a shared native Skill rebinds knowledge and relations without exporting private state or trust', async t => {
  const f = await fixture(t)
  await f.first.call('observe', { id: 'private-observation', scope: sender, url: 'https://private-erp.example/', title: 'Private', text: 'secret-business-value',
    locale: 'en', context: 'private', observedAt: '2026-10-01T00:00:00Z' })
  await f.first.call('knowledgeCommit', { scope: sender, origin: 'user', records: [
    node('private-menu-id', 'menu', { stage: 'observed', evidence: [{ observationId: 'private-observation', quote: 'secret-business-value' }], context: { url: 'https://private-erp.example/erp', detail: 'private-local-path' } }),
    node('private-domain-id', 'domain'),
    node('private-link-id', 'relation', { from: { id: 'private-menu-id', version: 1 }, to: { id: 'private-domain-id', version: 1 }, predicate: 'supports' }),
    node('private-field-id', 'field', { definition: { valueType: 'string', observedValues: ['private-customer-number'], completeness: 'unknown' } }),
  ] })
  await f.first.call('knowledgeVerify', { scope: sender, id: 'private-confirmation', target: { id: 'private-menu-id', version: 1 },
    proposition: 'private-proposition', conditions: 'private-conditions', method: 'private-method', verdict: 'supported', evidence: [] })
  const exported = await f.export.export(sender, new AbortController().signal)
  const data = await readFile(exported.importFile, 'utf8')
  for (const secret of ['sender-account', 'sender-tenant', 'private-erp.example', 'private-observation', 'secret-business-value', 'private-menu-id', 'private-customer-number', 'private-confirmation', 'private-local-path', 'private-proposition']) assert.ok(!data.includes(secret), secret)
  assert.equal((await stat(exported.importFile)).mode & 0o777, 0o600)
  assert.equal(exported.records, 4)
  // Any DSH with the ordinary filesystem provider can discover this exported directory.
  const ctx = new Context(); t.after(() => ctx.fiber.dispose())
  await ctx.plugin(Skills)
  await ctx.plugin(FileSkills, { includeDefaultRoots: false, customSkillDirs: [join(f.first.directory, 'exports')], watch: false })
  const available = await ctx.skills.list()
  assert.equal(available.length, 1)
  assert.ok((await ctx.skills.get(available[0].name)).content.includes('references/knowledge.json'))
  const received = await f.import.import(exported.importFile, receiver, new AbortController().signal)
  assert.deepEqual(received.scope, receiver)
  const all = await f.second.call('knowledgeSearch', { scope: receiver, query: '', after: '', limit: 50 })
  assert.equal(all.items.length, 4)
  for (const view of all.items) {
    assert.equal(view.record.origin, 'ai'); assert.equal(view.record.stage, 'interpreted')
    assert.deepEqual(view.record.flags, ['needs-review']); assert.deepEqual(view.record.evidence, [])
    assert.deepEqual(view.verifications, []); assert.deepEqual(view.record.scope, receiver)
    assert.deepEqual(view.staleDependencies, [])
  }
  const menu = all.items.find(v => v.record.kind === 'menu').record
  assert.equal((await f.second.call('knowledgeNeighbors', { scope: receiver, id: menu.id, direction: 'out', after: '', limit: 50 })).items[0].record.predicate, 'supports')
  const local = new Context(); t.after(() => local.fiber.dispose())
  await local.plugin(Skills); f.import.registerSkills(local)
  assert.equal((await local.skills.list()).length, 1)
  assert.ok((await local.skills.get((await local.skills.list())[0].name)).content.includes('needs-review'))
  await f.second.dispose()
  const restarted = new StorageClient({ directory: f.second.directory, scope: receiver }); t.after(() => restarted.dispose())
  assert.equal((await restarted.call('knowledgeSearch', { scope: receiver, query: 'Purchasing', after: '', limit: 50 })).items.length, 4)
})
test('identical reimports preserve local revisions, confirmations and unrelated knowledge', async t => {
  const f = await fixture(t)
  await f.first.call('knowledgeCommit', { scope: sender, origin: 'ai', records: [node('source-menu')] })
  await f.second.call('knowledgeCommit', { scope: receiver, origin: 'ai', records: [node('existing-local')] })
  const exported = await f.export.export(sender, new AbortController().signal)
  await f.import.import(exported.importFile, receiver, new AbortController().signal)
  const all = await f.second.call('knowledgeSearch', { scope: receiver, query: '', after: '', limit: 50 })
  const imported = all.items.find(v => v.record.id.startsWith('shared-')).record
  const { version, scope, origin, createdAt, recordedAt, ...fields } = imported
  await f.second.call('knowledgeCommit', { scope: receiver, origin: 'user', records: [{ ...fields, expectedVersion: version, description: 'Receiver corrected this locally.' }] })
  await f.import.import(exported.importFile, receiver, new AbortController().signal)
  const current = (await f.second.call('knowledgeGet', { scope: receiver, id: imported.id })).record
  assert.equal(current.version, 2); assert.equal(current.origin, 'user'); assert.equal(current.description, 'Receiver corrected this locally.')
  assert.equal((await f.second.call('knowledgeSearch', { scope: receiver, query: '', after: '', limit: 50 })).items.length, 2)
})
test('sharing omits stale relationships instead of rebinding them to a changed claim', async t => {
  const f = await fixture(t)
  await f.first.call('knowledgeCommit', { scope: sender, origin: 'ai', records: [
    node('menu'), node('domain', 'domain'), node('relation', 'relation', {
      from: { id: 'menu', version: 1 }, to: { id: 'domain', version: 1 }, predicate: 'supports',
    }),
  ] })
  await f.first.call('knowledgeCommit', { scope: sender, origin: 'ai', records: [node('menu', 'menu', { expectedVersion: 1, description: 'Changed meaning.' })] })
  const exported = await f.export.export(sender, new AbortController().signal)
  assert.equal(exported.records, 2); assert.equal(exported.omitted, 1)
  await f.import.import(exported.importFile, receiver, new AbortController().signal)
  const all = await f.second.call('knowledgeSearch', { scope: receiver, query: '', after: '', limit: 50 })
  assert.ok(all.items.every(item => item.record.kind !== 'relation'))
  await assert.rejects(f.import.import('relative.json', receiver, new AbortController().signal), { code: 'EXPERIENCE_ABSOLUTE_PATH_REQUIRED' })
})
test('partially existing imported IDs reject the whole bundle and preserve local knowledge', async t => {
  const f = await fixture(t)
  await f.first.call('knowledgeCommit', { scope: sender, origin: 'ai', records: [node('first'), node('second')] })
  const exported = await f.export.export(sender, new AbortController().signal)
  const reserved = `shared-${exported.bundleId.slice(0, 16)}-item-0001`
  await f.second.call('knowledgeCommit', { scope: receiver, origin: 'user', records: [node(reserved, 'menu', { description: 'Keep this local claim.' })] })
  await assert.rejects(f.import.import(exported.importFile, receiver, new AbortController().signal), { code: 'EXPERIENCE_IMPORT_CONFLICT' })
  const all = await f.second.call('knowledgeSearch', { scope: receiver, query: '', after: '', limit: 50 })
  assert.equal(all.items.length, 1); assert.equal(all.items[0].record.description, 'Keep this local claim.')
})
test('large imports commit once and cyclic or private bundles fail without partial local writes', async t => {
  const f = await fixture(t)
  for (let start = 0; start < 75; start += 25) await f.first.call('knowledgeCommit', { scope: sender, origin: 'ai', records: Array.from({ length: 25 }, (_, i) => node(`menu-${i + start}`)) })
  const exported = await f.export.export(sender, new AbortController().signal)
  assert.equal(exported.records, 75)
  await f.import.import(exported.importFile, receiver, new AbortController().signal)
  assert.equal((await f.second.call('knowledgeSearch', { scope: receiver, query: '', after: '', limit: 50 })).hasMore, true)
  const bad = JSON.parse(await readFile(exported.importFile, 'utf8'))
  bad.records[0].definition = { valueType: 'string', observedValues: ['private-value'], completeness: 'unknown' }
  const path = join(f.root, 'bad.json'); await writeFile(path, JSON.stringify(bad))
  await assert.rejects(f.import.import(path, receiver, new AbortController().signal), { code: 'EXPERIENCE_PRIVATE_OR_TRUSTED_DATA' })
  const a = node('item-0001'), b = node('item-0002')
  const link = (id, from, to) => node(id, 'relation', { from: { id: from, version: 1 }, to: { id: to, version: 1 }, predicate: 'contains' })
  const records = [a, b, link('item-0003', a.id, b.id), link('item-0004', b.id, a.id)]
  const bundleId = createHash('sha256').update(JSON.stringify(records)).digest('hex')
  await assert.rejects(f.second.call('knowledgeImport', { scope: receiver, bundleId, records }), { code: 'KNOWLEDGE_CONTAINMENT_CYCLE' })
  assert.equal(await f.second.call('knowledgeGet', { scope: receiver, id: `shared-${bundleId.slice(0, 16)}-${a.id}` }), null)
  await writeFile(path, '{broken')
  await assert.rejects(f.import.import(path, receiver, new AbortController().signal), { code: 'EXPERIENCE_INVALID_JSON' })
  await assert.rejects(f.import.import(exported.importFile, sender, new AbortController().signal), { code: 'ERP_SCOPE_MISMATCH: use the exact scope from erp_system_status' })
  const aborted = new AbortController(); aborted.abort()
  await assert.rejects(f.import.import(exported.importFile, receiver, aborted.signal), { name: 'AbortError' })
})
