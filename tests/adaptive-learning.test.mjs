import test from 'node:test'
import assert from 'node:assert/strict'
import { site } from './fixtures/erp-site.mjs'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { chromium } from 'playwright'
import * as plugin from '../dist/index.js'
import { BrowserSession } from '../dist/browser/session.js'
import { mount } from './harness.mjs'
import { parseRequest } from '../dist/protocol.js'

const resources = dirname(dirname(dirname(chromium.executablePath())))
const signal = () => new AbortController().signal
function agent() {
  const events = [{ type: 'turn/start' }]
  return { session: { get seq() { return events.length }, eventAt(i) { return events[i] }, append(type, data) { const e = { type, data }; events.push(e); return e } } }
}

for (const path of ['/suite/', '/office/']) test(`empty knowledge learns a distinct ERP UI through native tools and real IPC: ${path}`, async () => {
  const f = await site(), root = mkdtempSync(join(tmpdir(), 'adapt-erp-'))
  const config = { dataDir: root, system: { url: f.origin + path, account: 'fixture-user' }, browserHeadless: true, browserSandbox: false, browserResourcesDir: resources }
  let host
  try {
    host = await mount(plugin, undefined, config)
    const scope = (await host.run('erp_system_status')).value.scope
    assert.equal((await host.run('erp_storage_status')).value.observations, 0)
    for (const tool of ['erp_scm_read', 'erp_scm_connect', 'erp_scm_enable', 'erp_scm_trace_product']) assert.equal((await host.run(tool)).isError, true)
    const connected = await host.run('erp_connect'); assert.equal(connected.isError, false, JSON.stringify(connected))
    const requests = []; let answer = 'allowed-once'
    host.ctx.on('approval/request', async request => { requests.push(request); return answer })
    const execution = { agent: agent() }
    assert.equal((await host.run('erp_browser_resume', { sessionId: connected.value.sessionId, revision: connected.value.revision }, execution)).isError, false)
    const initial = await host.run('erp_browser_snapshot'); assert.equal(initial.isError, false, JSON.stringify(initial))
    assert.ok(!JSON.stringify(initial.value).includes('PRIVATE-'))
    assert.ok(!JSON.stringify(initial.value).includes('HIDDEN-CREDENTIAL'))
    const imported = await host.run('erp_learning_import_snapshot', { scope, observationId: initial.value.observationId })
    assert.equal(imported.isError, false, JSON.stringify(imported)); assert.equal(imported.value.menuIds.length, 2)
    const duplicate = await host.run('erp_learning_import_snapshot', { scope, observationId: initial.value.observationId })
    assert.equal(duplicate.value.records, imported.value.records)
    const menu = (await host.run('erp_knowledge_get', { scope, id: imported.value.menuIds[0] })).value.record
    assert.equal(menu.version, 1)
    let round = (await host.run('erp_learning_start', { scope, id: 'full', units: [{ id: 'global', level: 1, label: 'Global menu' }, { id: 'fields', level: 3, label: 'Field semantics' }] })).value
    round = (await host.run('erp_learning_extend', { scope, id: 'full', expectedVersion: round.version, units: [{ id: 'functional', level: 2, label: menu.name }] })).value
    assert.equal((await host.run('erp_learning_finish_unit', { scope, id: 'full', expectedVersion: round.version, unitId: 'global', outcome: 'observed', observationIds: [initial.value.observationId], reason: 'Visible menus captured' })).isError, false)
    assert.equal((await host.run('erp_learning_status', { scope, id: 'full' })).value.next.id, 'functional')
    const action = (snapshot, ref, operation = 'click', value) => ({ sessionId: snapshot.sessionId, revision: snapshot.revision, snapshotId: snapshot.snapshotId, ref, operation, reason: 'Inspect the selected UI and save its result', ...(value === undefined ? {} : { value }) })
    const firstMenu = initial.value.controls.find(c => c.kind === 'treeitem' || c.kind === 'menuitem')
    answer = 'rejected'
    assert.equal((await host.run('erp_browser_action', action(initial.value, firstMenu.ref), execution)).isError, true)
    assert.equal(f.writes(), 0)
    answer = 'allowed-once'
    const opened = await host.run('erp_browser_action', action(initial.value, firstMenu.ref), execution)
    assert.equal(opened.isError, false, JSON.stringify(opened)); assert.ok(JSON.stringify(opened.value.frames).includes('P-501'))
    assert.ok(JSON.stringify(opened.value.frames).includes('12'))
    const details = await host.run('erp_learning_import_snapshot', { scope, observationId: opened.value.observationId })
    assert.equal(details.isError, false, JSON.stringify(details))
    const fields = (await host.run('erp_knowledge_search', { scope, kind: 'field', query: '', after: '', limit: 50 })).value.items
    assert.ok(fields.some(x => x.record.definition.observedValues.includes(path === '/suite/' ? 'Approved' : '已确认')))
    assert.ok(fields.every(x => x.record.definition.completeness === 'unknown'))
    const domain = { id: 'inventory-domain', kind: 'domain', name: 'Inventory', aliases: [], description: 'Stock understanding from observed product and balance columns', expectedVersion: 0, stage: 'interpreted', flags: ['needs-review'], lifecycle: 'active', evidence: [{ observationId: opened.value.observationId, quote: 'Balance' }], dependencies: [] }
    const currentMenu = (await host.run('erp_knowledge_get', { scope, id: menu.id })).value.record
    const relation = { ...domain, id: 'menu-domain', kind: 'relation', name: 'supports', from: { id: menu.id, version: currentMenu.version }, to: { id: domain.id, version: 1 }, predicate: 'supports' }
    const learned = await host.run('erp_knowledge_record', { scope, records: [domain, relation] })
    assert.equal(learned.isError, false, JSON.stringify(learned))
    const control = opened.value.controls.find(c => c.kind === 'field' && c.options.length)
    const selected = await host.run('erp_browser_action', action(opened.value, control.ref, 'select', control.options[1]), execution)
    assert.equal(selected.isError, false, JSON.stringify(selected))
    assert.equal(selected.value.controls.find(c => c.name === control.name).value, control.options[1])
    let current = selected.value
    if (path === '/suite/') {
      const input = current.controls.find(c => c.inputType === 'text')
      const filled = await host.run('erp_browser_action', action(current, input.ref, 'fill', 'P-501'), execution)
      assert.equal(filled.isError, false, JSON.stringify(filled)); current = filled.value
      const search = current.controls.find(c => c.name === 'Search')
      const found = await host.run('erp_browser_action', action(current, search.ref), execution)
      assert.equal(found.isError, false, JSON.stringify(found)); current = found.value
      assert.ok(current.frames[0].text.includes('P-501'))
    } else {
      const tab = current.controls.find(c => c.kind === 'tab')
      const dialog = await host.run('erp_browser_action', action(current, tab.ref), execution)
      assert.equal(dialog.isError, false, JSON.stringify(dialog)); current = dialog.value
      assert.ok(current.controls.some(c => c.name === '关闭'))
      const closed = await host.run('erp_browser_action', action(current, current.controls.find(c => c.name === '关闭').ref), execution)
      assert.equal(closed.isError, false, JSON.stringify(closed)); current = closed.value
    }
    const commit = current.controls.find(c => c.name === 'Commit')
    answer = 'rejected'
    assert.equal((await host.run('erp_browser_action', action(current, commit.ref), execution)).isError, true)
    assert.equal(f.writes(), 0)
    answer = 'allowed-once'
    const committed = await host.run('erp_browser_action', { ...action(current, commit.ref), reason: 'Write one synthetic fixture record, explicitly approved by the test user' }, execution)
    assert.equal(committed.isError, false, JSON.stringify(committed))
    assert.equal(f.writes(), 1)
    // Reusing the old ref/revision cannot replay even with another host approval.
    assert.equal((await host.run('erp_browser_action', action(current, commit.ref), execution)).isError, true)
    assert.equal(f.writes(), 1)
    assert.ok(requests.filter(x => x.toolName === 'erp_browser_action').length >= 4)
    assert.ok(!f.requests.some(x => x.url.includes('/api/') || x.url.includes('usa-')))
    await host.dispose(); host = await mount(plugin, undefined, config)
    assert.equal((await host.run('erp_browser_status')).value.state, 'closed')
    assert.equal((await host.run('erp_knowledge_get', { scope, id: domain.id })).value.record.description, domain.description)
    const resumed = (await host.run('erp_learning_status', { scope, id: 'full' })).value
    assert.equal(resumed.state, 'paused')
    assert.equal((await host.run('erp_learning_pause', { scope, id: 'full', expectedVersion: resumed.version, resume: true })).isError, false)
    assert.equal((await host.run('erp_learning_status', { scope, id: 'full' })).value.next.id, 'functional')
    const exported = await host.run('erp_knowledge_export', { scope }); assert.equal(exported.isError, false)
  } finally { await host?.dispose(); await f.close(); rmSync(root, { recursive: true, force: true }) }
})

test('targets reject page replacement, credentials, external links and replay; fresh snapshots observe changed UI', async () => {
  const f = await site(), root = mkdtempSync(join(tmpdir(), 'adapt-targets-'))
  const browser = new BrowserSession({ directory: root, headless: true, sandbox: false, prepare: async () => {} })
  try {
    await browser.connect({ siteUrl: f.origin + '/suite/', scope: { site: 'test', account: 'reader' } }, signal())
    const page = browser.context.pages()[0]
    let status = browser.status(); await browser.resume(status.sessionId, status.revision, signal())
    const snap = await browser.snapshot(signal()), target = snap.controls.find(c => c.name === 'Commit')
    const args = { sessionId: snap.sessionId, revision: snap.revision, snapshotId: snap.snapshotId, ref: target.ref, operation: 'click', reason: 'Test mutation' }
    await page.evaluate(() => { document.querySelector('body > button').textContent = 'Changed action' })
    await assert.rejects(browser.action(args, signal()), /BROWSER_TARGET_CHANGED/)
    assert.equal(f.writes(), 0)
    status = browser.status(); await browser.resume(status.sessionId, status.revision, signal())
    const fresh = await browser.snapshot(signal()); assert.ok(fresh.controls.some(c => c.name === 'Changed action'))
    await page.evaluate(() => {
      const row = document.createElement('div'); row.setAttribute('role', 'row')
      row.innerHTML = 'Item A <button>View<span data-erp-private>PRIVATE-IN-LABEL</span></button>'
      document.body.append(row)
    })
    const rowSnapshot = await browser.snapshot(signal()), rowTarget = rowSnapshot.controls.find(c => c.name === 'View')
    assert.ok(rowTarget.context.includes('Item A'))
    assert.ok(!JSON.stringify(rowSnapshot).includes('PRIVATE-IN-LABEL'))
    await page.evaluate(() => { document.querySelector('[role="row"]').firstChild.textContent = 'Item B ' })
    await assert.rejects(browser.action({ ...args, revision: rowSnapshot.revision, snapshotId: rowSnapshot.snapshotId, ref: rowTarget.ref }, signal()), /BROWSER_TARGET_CHANGED/)
    status = browser.status(); await browser.resume(status.sessionId, status.revision, signal())
    await page.evaluate(() => { const a = document.createElement('a'); a.href = 'https://example.invalid/'; a.textContent = 'External'; document.body.append(a) })
    const external = await browser.snapshot(signal()), link = external.controls.find(c => c.name === 'External')
    await assert.rejects(browser.action({ ...args, revision: external.revision, snapshotId: external.snapshotId, ref: link.ref }, signal()), /BROWSER_TARGET_OUTSIDE_APPLICATION/)
    await assert.rejects(browser.action(args, signal()), /BROWSER_STALE_TARGET/)
    assert.throws(() => parseRequest({ v: 1, kind: 'browser', id: 'x', method: 'browser.scmRead', input: {} }), /INVALID_PROTOCOL_MESSAGE/)
  } finally { await browser.close(); await f.close(); rmSync(root, { recursive: true, force: true }) }
})
