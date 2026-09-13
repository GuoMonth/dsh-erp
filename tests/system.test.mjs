import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import http from 'node:http'
import { chromium } from 'playwright'
import * as plugin from '../dist/index.js'
import { resolveSystem, systemBrowserInput } from '../dist/system.js'
import { BrowserSession } from '../dist/browser/session.js'
import { mount } from './harness.mjs'

function directory(t) {
  const dir = mkdtempSync(join(tmpdir(), 'erp-system-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}
const signal = () => new AbortController().signal

test('stable system ID survives restart, display rename and login route change; other applications stay separate', t => {
  const root = directory(t)
  const first = resolveSystem({ url: 'https://EXAMPLE.test:443/app/#/login' }, root)
  const next = resolveSystem({ url: 'https://example.test/app/#/home', name: 'My ERP' }, root)
  assert.equal(first.id, next.id)
  assert.equal(first.directory, next.directory)
  assert.equal(next.name, 'My ERP')
  assert.equal(JSON.parse(readFileSync(join(next.directory, 'system.json'))).entryUrl, next.entryUrl)
  const other = resolveSystem({ url: 'https://example.test/other/' }, root)
  assert.notEqual(other.id, first.id)
  const role = resolveSystem({ url: next.entryUrl, account: 'buyer', tenant: 'branch', role: 'purchasing' }, root)
  assert.equal(role.id, first.id)
  assert.notDeepEqual(role.scope, first.scope)
})

test('entry/base URL validation rejects ambiguous roots, credentials, queries and cross-system entries', t => {
  const root = directory(t)
  for (const config of [
    { url: 'https://example.test/login' }, { url: 'https://u:p@example.test/' },
    { url: 'https://example.test/?token=secret' }, { url: 'https://example.test/#/login?token=secret' },
    { url: 'file:///tmp/erp/' }, { url: 'https://other.test/', baseUrl: 'https://example.test/' },
    { url: 'https://example.test/app2/', baseUrl: 'https://example.test/app/' },
  ]) assert.throws(() => resolveSystem(config, root))
  assert.equal(resolveSystem({ url: 'https://example.test/app/login', baseUrl: 'https://example.test/app/' }, root).baseUrl, 'https://example.test/app/')
})

test('configured native tools reuse stored knowledge without login and reject other scopes or model-selected URLs', async t => {
  const root = directory(t)
  const config = { dataDir: root, system: { url: 'https://example.test/app/#/login', account: 'reader' } }
  let host = await mount(plugin, undefined, config)
  t.after(() => host.dispose())
  const status = (await host.run('erp_system_status')).value
  const scope = status.scope
  const record = { id: 'menu', kind: 'menu', name: 'Inventory', aliases: [], description: 'Saved hypothesis',
    expectedVersion: 0, stage: 'interpreted', flags: ['needs-review'], lifecycle: 'active', evidence: [], dependencies: [] }
  assert.equal((await host.run('erp_knowledge_record', { scope, records: [record] })).isError, false)
  assert.equal((await host.run('erp_connect', { siteUrl: 'https://wrong.test/' })).isError, true)
  assert.equal((await host.run('erp_browser_status')).value.state, 'closed')
  assert.equal((await host.run('erp_knowledge_get', { scope: { ...scope, account: 'another' }, id: 'menu' })).isError, true)
  await host.dispose()
  host = await mount(plugin, undefined, config)
  assert.equal((await host.run('erp_system_status')).value.id, status.id)
  assert.equal((await host.run('erp_knowledge_get', { scope, id: 'menu' })).value.record.name, 'Inventory')
  assert.equal((await host.run('erp_browser_status')).value.state, 'closed')
  await host.dispose()
  host = await mount(plugin, undefined, { ...config, system: { ...config.system, account: 'another' } })
  const otherScope = (await host.run('erp_system_status')).value.scope
  assert.equal((await host.run('erp_knowledge_get', { scope: otherScope, id: 'menu' })).value, null)
})

test('missing configuration gives actionable status, disables connection and never auto-imports legacy data', async t => {
  const root = directory(t)
  const host = await mount(plugin, undefined, { dataDir: root })
  t.after(() => host.dispose())
  assert.equal((await host.run('erp_system_status')).value.state, 'unconfigured')
  assert.equal((await host.run('erp_connect')).isError, true)
  assert.equal((await host.run('erp_browser_open')).isError, true)
  const scope = { site: 'old-site-alias', account: 'old-account' }
  const record = { id: 'legacy-menu', kind: 'menu', name: 'Legacy inventory', aliases: [], description: 'Old hypothesis',
    expectedVersion: 0, stage: 'interpreted', flags: ['needs-review'], lifecycle: 'active', evidence: [], dependencies: [] }
  assert.equal((await host.run('erp_knowledge_record', { scope, records: [record] })).isError, false)
  const profile = resolveSystem({ url: 'https://example.test/' }, root)
  assert.equal(profile.legacyDataPresent, true)
  const configured = await mount(plugin, undefined, { dataDir: root, system: { url: 'https://example.test/' } })
  t.after(() => configured.dispose())
  assert.equal((await configured.run('erp_knowledge_get', { scope: profile.scope, id: record.id })).value, null)
  assert.equal((await host.run('erp_knowledge_get', { scope, id: record.id })).value.record.name, record.name)
  assert.equal((await host.run('erp_storage_backup')).isError, false)
})

test('configured path/hash opens unchanged; manual login is required and no business request happens before enable', async t => {
  const root = directory(t)
  const requests = []
  const server = http.createServer((req, res) => {
    requests.push(req.url)
    if (req.url.startsWith('/api/')) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ code: 0, data: [] })); return }
    res.end('<html><body><input type="password"><h1>Sign in</h1></body></html>')
  })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  t.after(() => new Promise(r => server.close(r)))
  const base = `http://127.0.0.1:${server.address().port}/`
  const system = resolveSystem({ url: `${base}app/#/sign-in` }, root)
  const host = await mount(plugin, undefined, { dataDir: root, system: { url: system.entryUrl },
    browserHeadless: process.env.ERP_TEST_HEADFUL !== '1', browserSandbox: false,
    browserResourcesDir: dirname(dirname(dirname(chromium.executablePath()))) })
  try {
    const connected = await host.run('erp_connect')
    assert.equal(connected.isError, false, JSON.stringify(connected))
    assert.equal(connected.value.pageUrl, system.entryUrl)
    assert.equal(connected.value.state, 'manual')
    assert.ok(!requests.some(p => p.startsWith('/api/')))
  } finally { await host.dispose() }
  const browser = new BrowserSession({ directory: system.directory, headless: process.env.ERP_TEST_HEADFUL !== '1', sandbox: false, prepare: async () => {} })
  t.after(() => browser.close())
  let status = await browser.connect(systemBrowserInput(system), signal())
  const page = browser.context.pages()[0]
  assert.equal(page.url(), system.entryUrl)
  assert.equal(status.state, 'manual')
  assert.ok(!requests.some(p => p.startsWith('/api/')))
  await assert.rejects(browser.resume(status.sessionId, status.revision, signal()), /BROWSER_LOGIN_REQUIRED/)
  // Test fixture simulates the human completing authentication; no production credential tool exists.
  await page.evaluate(() => document.querySelector('input').remove())
  status = browser.status()
  status = await browser.resume(status.sessionId, status.revision, signal())
  const snapshot = await browser.snapshot(signal())
  assert.ok(snapshot.frames[0].text.includes('Sign in'))
  assert.ok(!requests.some(p => p.startsWith('/api/')))
  await browser.close()
  const reopened = await browser.connect(systemBrowserInput(system), signal())
  assert.equal(reopened.state, 'manual')
  await assert.rejects(browser.snapshot(signal()), /BROWSER_MANUAL_CONTROL/)
})
