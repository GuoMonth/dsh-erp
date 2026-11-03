import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import * as plugin from '../dist/index.js'
import { Context } from '@deepseek-ai/cordis'
import { erpRequest } from '../dist/product/api.js'
import { registerErpChannel } from '../dist/product/channel.js'
import { indexLines } from '../dist/present.js'
import { resumeTarget } from '../dist/product/resume.js'
import { SiteCatalog } from '../dist/sites/catalog.js'
import { baseIssue, entryIssue } from '../dist/product/wizard.js'
import { mount } from './harness.mjs'

function directory(t) {
  const dir = mkdtempSync(join(tmpdir(), 'erp-sites-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}
const agent = id => ({ session: { id, header: { id } } })
const record = () => ({ id: 'menu', kind: 'menu', name: 'Inventory', aliases: [], description: 'Saved for one site',
  expectedVersion: 0, stage: 'interpreted', flags: ['needs-review'], lifecycle: 'active', evidence: [], dependencies: [] })

test('two sites keep separate sessions, scopes and indexes', async t => {
  const root = directory(t)
  const host = await mount(plugin, undefined, { dataDir: root, sites: [
    { url: 'https://a.example/app/', account: 'one', name: 'Alpha' },
    { url: 'https://b.example/app/', account: 'two', name: 'Beta' },
  ] })
  t.after(() => host.dispose())
  const listed = host.ctx.erp.catalog.listPublic()
  assert.equal(listed.length, 2)
  assert.equal(listed.some(site => 'password' in site), false)
  host.ctx.erp.catalog.bind('sess-a', listed[0].id)
  host.ctx.erp.catalog.bind('sess-b', listed[1].id)
  const alpha = await host.run('erp_system_status', {}, { agent: agent('sess-a') })
  const beta = await host.run('erp_system_status', {}, { agent: agent('sess-b') })
  assert.equal(alpha.value.state, 'configured')
  assert.match(alpha.value.entryUrl, /a\.example/)
  assert.match(beta.value.entryUrl, /b\.example/)
  assert.notEqual(alpha.value.scope.site, beta.value.scope.site)
  assert.equal((await host.run('erp_knowledge_record', { scope: alpha.value.scope, records: [record()] }, { agent: agent('sess-a') })).isError, false)
  assert.equal((await host.run('erp_knowledge_get', { scope: alpha.value.scope, id: 'menu' }, { agent: agent('sess-b') })).isError, true)
  assert.equal((await host.run('erp_knowledge_get', { scope: beta.value.scope, id: 'menu' }, { agent: agent('sess-b') })).value, null)
  assert.equal((await host.run('erp_knowledge_get', { scope: alpha.value.scope, id: 'menu' }, { agent: agent('sess-a') })).value.record.name, 'Inventory')
  assert.equal((await host.run('erp_system_status')).value.state, 'select-site')
  assert.equal((await host.run('erp_system_status')).value.sites.some(site => site.entryUrl), false)
})

test('desktop add rejects passwords and a new site does not see another index', async t => {
  const root = directory(t)
  const host = await mount(plugin, undefined, { dataDir: root, system: { url: 'https://a.example/app/', account: 'one' } })
  t.after(() => host.dispose())
  const rejected = erpRequest(host.ctx.erp.catalog, { op: 'add', url: 'https://b.example/app/', account: 'two', password: 'secret' })
  assert.equal(rejected.ok, false)
  assert.equal(rejected.error.code, 'ERP_PASSWORD_REJECTED')
  const added = erpRequest(host.ctx.erp.catalog, { op: 'add', url: 'https://b.example/app/', name: 'Beta', account: 'buyer' })
  assert.equal(added.ok, true)
  assert.equal(added.value.sites.length, 2)
  assert.equal(added.value.sites.some(site => JSON.stringify(site).toLowerCase().includes('password')), false)
  const beta = added.value.sites.find(site => site.entryUrl.includes('b.example'))
  host.ctx.erp.catalog.bind('sess-b', beta.id)
  const status = await host.run('erp_system_status', {}, { agent: agent('sess-b') })
  assert.match(status.value.entryUrl, /b\.example/)
  assert.equal(status.value.scope.account, 'buyer')
  const alpha = host.ctx.erp.catalog.listPublic().find(site => site.entryUrl.includes('a.example'))
  host.ctx.erp.catalog.bind('sess-a', alpha.id)
  const alphaStatus = await host.run('erp_system_status', {}, { agent: agent('sess-a') })
  assert.equal((await host.run('erp_knowledge_record', { scope: alphaStatus.value.scope, records: [record()] }, { agent: agent('sess-a') })).isError, false)
  assert.equal((await host.run('erp_knowledge_get', { scope: status.value.scope, id: 'menu' }, { agent: agent('sess-b') })).value, null)
  const removed = erpRequest(host.ctx.erp.catalog, { op: 'remove', id: beta.id })
  assert.equal(removed.ok, true)
  assert.equal(removed.value.sites.some(site => site.id === beta.id), false)
  const rebound = await host.run('erp_system_status', {}, { agent: agent('sess-b') })
  assert.equal(rebound.value.state, 'select-site')
})

test('continue restores the last opened site and does not jump to a different one', async t => {
  const root = directory(t)
  const host = await mount(plugin, undefined, { dataDir: root })
  t.after(() => host.dispose())
  const first = erpRequest(host.ctx.erp.catalog, { op: 'add', url: 'https://a.example/app/', name: 'Alpha', account: 'one' })
  const second = erpRequest(host.ctx.erp.catalog, { op: 'add', url: 'https://b.example/app/', name: 'Beta', account: 'two' })
  assert.equal(second.ok, true)
  const alpha = first.value.sites.find(site => site.name === 'Alpha')
  const beta = second.value.sites.find(site => site.name === 'Beta')
  assert.equal(resumeTarget(second.value.sites, ''), undefined)
  const opened = erpRequest(host.ctx.erp.catalog, { op: 'opened', id: alpha.id })
  assert.equal(opened.value.lastOpenedId, alpha.id)
  assert.equal(resumeTarget(opened.value.sites, opened.value.lastOpenedId).id, alpha.id)
  const again = new SiteCatalog(root)
  t.after(() => again.dispose())
  assert.equal(again.lastOpened(), alpha.id)
  const removed = erpRequest(host.ctx.erp.catalog, { op: 'remove', id: alpha.id })
  assert.equal(removed.value.lastOpenedId, alpha.id)
  assert.equal(resumeTarget(removed.value.sites, removed.value.lastOpenedId), undefined)
  assert.equal(removed.value.sites.some(site => site.id === beta.id), true)
  assert.equal(entryIssue('https://user:secret@a.example/app/'), 'credentials')
  assert.equal(entryIssue('https://a.example/app/?token=1'), 'query')
  assert.equal(entryIssue('https://a.example/app/'), '')
  assert.equal(baseIssue('https://a.example/app'), 'slash')
  assert.equal(baseIssue(''), '')
  const lines = indexLines({ initialized: true, summaries: [
    { level: 1, title: 'Menus', summary: 'Purchasing and stock were visible.', leafCount: 2 },
  ], leaves: { items: [{ kind: 'menu', name: 'Stock', description: 'Observed stock menu' }], hasMore: true, nextAfter: 'stock' } })
  const text = lines.join('\n')
  assert.match(text, /Level 1 · Menus/)
  assert.match(text, /before a live observation/)
  assert.match(text, /menu · Stock/)
  assert.match(text, /after="stock"/)
})

test('the wizard rejects a bad entry and an edited account stays off other sessions', async t => {
  const root = directory(t)
  const host = await mount(plugin, undefined, { dataDir: root, system: { url: 'https://a.example/app/', account: 'one', name: 'Alpha' } })
  t.after(() => host.dispose())
  const listed = erpRequest(host.ctx.erp.catalog, { op: 'list' })
  const alpha = listed.value.sites[0]
  host.ctx.erp.catalog.bind('sess-a', alpha.id)
  assert.equal(erpRequest(host.ctx.erp.catalog, { op: 'add', url: 'https://user:pw@b.example/app/' }).error.code, 'INVALID_ENTRY_URL')
  assert.equal(erpRequest(host.ctx.erp.catalog, { op: 'add', url: 'https://b.example/login' }).error.code, 'ERP_BASE_URL_REQUIRED')
  assert.equal(erpRequest(host.ctx.erp.catalog, { op: 'add', url: 'javascript:alert(1)' }).ok, false)
  const renamed = erpRequest(host.ctx.erp.catalog, { op: 'update', id: alpha.id, url: alpha.entryUrl, name: 'Renamed', account: 'one' })
  assert.equal(renamed.value.sites[0].id, alpha.id)
  assert.equal(renamed.value.sites[0].name, 'Renamed')
  assert.equal((await host.run('erp_system_status', {}, { agent: agent('sess-a') })).value.name, 'Renamed')
  const moved = erpRequest(host.ctx.erp.catalog, { op: 'update', id: alpha.id, url: 'https://a.example/app/', account: 'buyer', name: 'Renamed' })
  assert.equal(moved.ok, true)
  assert.equal(moved.value.sites.some(site => site.id === alpha.id), false)
  assert.equal(moved.value.sites[0].account, 'buyer')
  assert.equal((await host.run('erp_system_status', {}, { agent: agent('sess-a') })).value.state, 'select-site')
  const buyer = moved.value.sites[0]
  host.ctx.erp.catalog.bind('sess-b', buyer.id)
  const buyerStatus = await host.run('erp_system_status', {}, { agent: agent('sess-b') })
  assert.equal((await host.run('erp_index_read', { scope: buyerStatus.value.scope, after: '', limit: 5 }, { agent: agent('sess-a') })).isError, true)
  const page = await host.run('erp_index_read', { scope: buyerStatus.value.scope, after: '', limit: 5 }, { agent: agent('sess-b') })
  assert.equal(page.isError, false)
  assert.match(page.content.map(block => block.text).join('\n'), /No level summary yet for this site/)
  assert.match(page.content.map(block => block.text).join('\n'), /another site/)
})

test('the desktop channel drops its route when the plugin unloads', async t => {
  const root = directory(t)
  const ctx = new Context()
  const catalog = new SiteCatalog(root)
  let disposed = false
  t.after(async () => { await ctx.fiber.dispose(); await catalog.dispose() })
  await ctx.plugin(inner => {
    inner.provide('connection', { fetch: { register() { return async () => { disposed = true } } } })
  })
  registerErpChannel(ctx, catalog)
  await new Promise(resolve => setTimeout(resolve, 20))
  assert.equal(disposed, false)
  await ctx.fiber.dispose()
  assert.equal(disposed, true)
})

test('the package has a desktop client entry and no Deskwork or password field', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const names = JSON.stringify({ ...pkg.dependencies, ...pkg.optionalDependencies, ...pkg.peerDependencies, ...pkg.devDependencies }).toLowerCase()
  assert.equal(names.includes('deskwork'), false)
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.equal(pkg.exports['./client'], './dist/client.js')
  assert.equal(pkg.exports['./package.json'], './package.json')
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  assert.match(patch, /name:\s*'@guosheng_047\/dsh-erp'/)
  assert.doesNotMatch(patch, /dsh-erp\/native/)
  const source = readFileSync(new URL('../dist/client.js', import.meta.url), 'utf8')
  assert.match(source, /window\.__ModuleLoader__\.load/)
  assert.match(source, /var module = \{ exports: \{\} \}/)
  assert.match(source, /ERP 助手/)
  assert.match(source, /Adapt ERP/)
  assert.match(source, /openTab\("browser"/)
  assert.doesNotMatch(source, /type:"password"|type: "password"|type=\"password\"/)
  assert.doesNotMatch(source, /deskwork/i)
})
