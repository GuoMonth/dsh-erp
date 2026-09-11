import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright'
import { BrowserSession } from '../dist/browser/session.js'
import { BrowserRuntime, registerBrowserTools } from '../dist/browser/runtime.js'
import { loadReadPolicy } from '../dist/browser/read-policy.js'
import { StorageClient } from '../dist/storage/client.js'
import { WorkerClient } from '../dist/worker-client.js'
import { parseRequest, validateBrowser } from '../dist/protocol.js'
import { mount } from './harness.mjs'

const scope = { site: 'fixture', account: 'reader', tenant: 'demo', role: 'reader' }
const signal = () => new AbortController().signal
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'erp-read-nav-')); const policyFile = join(root, 'read-policy.json')
  let effects = 0; const calls = []; let releaseSlow
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk
    calls.push({ url: req.url, body, method: req.method, cookie: req.headers.cookie, override: req.headers['x-http-method-override'] })
    if (req.url === '/erp/write' || req.headers['x-http-method-override'] || (req.url === '/erp/query' && body !== '{"status":"pending"}')) effects++
    res.setHeader('content-type', 'text/html')
    if (req.url === '/erp/home') { res.setHeader('set-cookie', 'session=FIXTURE_LOGIN; Path=/erp/'); return res.end('<h1>Manual login fixture</h1>') }
    if (req.url === '/erp/query') { res.setHeader('content-type', 'application/json'); return res.end('{"label":"Pending receipt"}') }
    if (req.url === '/erp/redirect') { res.writeHead(302, { location: '/erp/write' }); return res.end() }
    if (req.url === '/erp/slow') { releaseSlow = () => { if (!res.destroyed) res.end('<h1>Slow read</h1>') }; return }
    if (req.url === '/erp/purchasing') return res.end(`<h1>Purchasing</h1><button id="status">Loading</button><script>
      localStorage.setItem('pendingChange','CHILD_ONLY'); document.cookie='session=CHILD_ONLY; Path=/erp/';
      fetch('/erp/query',{method:'POST',body:'{"status":"pending"}',headers:{'content-type':'application/json','x-http-method-override':'DELETE'}})
      .then(r=>r.json()).then(v=>document.querySelector('#status').textContent=v.label)</script>`)
    if (req.url === '/erp/stock') return res.end('<h1>Stock</h1><button>Receiving</button>')
    const actions = {
      '/erp/autosave': `fetch('/erp/write',{method:'POST',body:'save'})`,
      '/erp/get-write': `fetch('/erp/write')`,
      '/erp/wrong-body': `fetch('/erp/query',{method:'POST',body:'{"status":"approved"}'})`,
      '/erp/iframe': `document.body.innerHTML+='<iframe src="/erp/write"></iframe>'`,
      '/erp/popup': `window.open('/erp/write')`,
      '/erp/socket': `new WebSocket('ws://'+location.host+'/erp/write')`,
      '/erp/worker': `new Worker(URL.createObjectURL(new Blob(["fetch('/erp/write')"],{type:'text/javascript'})))`,
      '/erp/dialog': `alert('Review this')`,
      '/erp/login': `document.body.innerHTML+='<input type="password">'`,
    }
    res.end(`<h1>Fixture ${req.url}</h1><script>${actions[req.url] || ''}</script>`)
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}/erp/`
  const paths = ['purchasing', 'stock', 'autosave', 'get-write', 'wrong-body', 'iframe', 'popup', 'socket', 'worker', 'dialog', 'login', 'redirect', 'slow']
  const policy = { format: 1, id: 'reviewed-fixture', siteUrl: base, scope, reviewBasis: 'Synthetic server source inspected; query has no write, unsafe behavior used for negative tests.',
    requests: [...paths.map(path => ({ id: path, url: base + path, method: 'GET', body: '', contentType: '' })),
      { id: 'query', url: base + 'query', method: 'POST', body: '{"status":"pending"}', contentType: 'application/json' }],
    routes: paths.map(path => ({ id: path, label: path, url: base + path, requests: [path, 'query'] })) }
  await writeFile(policyFile, JSON.stringify(policy))
  const session = new BrowserSession({ directory: root, headless: process.env.ERP_TEST_HEADFUL !== '1', sandbox: false, readPolicyFile: policyFile })
  await session.open({ siteUrl: base, scope }, signal())
  await session.context.pages()[0].goto(base + 'home'); await delay(30)
  const grant = () => { const status = session.status(); return session.enableRead({ sessionId: status.sessionId, revision: status.revision, policyDigest: session.readPolicy().digest }, signal()) }
  const args = (value, routeId) => ({ sessionId: value.sessionId, revision: value.revision, policyDigest: value.policyDigest, routeId })
  t.after(async () => { releaseSlow?.(); await session.close(); server.closeAllConnections(); await new Promise(r => server.close(r)); await rm(root, { recursive: true, force: true }) })
  return { root, policyFile, policy, session, base, grant, args, calls, effects: () => effects }
}

test('reviewed GET and POST read routes capture labels, preserve manual state and strip method override headers', async t => {
  const f = await fixture(t); const grant = await f.grant()
  const captured = await f.session.read(f.args(grant, 'purchasing'), signal())
  validateBrowser('browser.read', 'output', captured)
  assert.ok(captured.entries.some(entry => entry.text === 'Pending receipt'))
  assert.ok(captured.limitations.includes(`read-policy:${grant.policyDigest}`))
  assert.equal(f.effects(), 0)
  assert.equal(await f.session.context.pages()[0].evaluate(() => localStorage.getItem('pendingChange')), null)
  assert.equal((await f.session.context.cookies()).find(c => c.name === 'session').value, 'FIXTURE_LOGIN')
  assert.equal(f.session.context.browser().contexts().length, 1)
  assert.ok(!JSON.stringify(captured).includes('FIXTURE_LOGIN')); assert.ok(!JSON.stringify(captured).includes('CHILD_ONLY'))
  const query = f.calls.find(call => call.url === '/erp/query')
  assert.equal(query.override, undefined)
  const next = await f.session.read(f.args(grant, 'stock'), signal())
  assert.ok(next.entries.some(entry => entry.text === 'Receiving'))
  assert.equal(f.session.readGrant.remaining, 18)
})
test('unknown autosave, write GET, changed body, frame, popup, WebSocket, redirect and dialog fail without business requests', async t => {
  const f = await fixture(t)
  for (const route of ['autosave', 'get-write', 'wrong-body', 'iframe', 'popup', 'socket', 'redirect', 'dialog', 'login']) {
    const grant = await f.grant()
    await assert.rejects(f.session.read(f.args(grant, route), signal()), error => {
      assert.ok(['READ_REQUEST_BLOCKED', 'READ_POPUP_BLOCKED', 'READ_WEBSOCKET_BLOCKED', 'READ_REDIRECT_BLOCKED', 'READ_DIALOG_BLOCKED', 'BROWSER_LOGIN_REQUIRED'].includes(error.code), `${route}: ${error.code}`)
      return true
    })
    assert.equal(f.effects(), 0, route)
    assert.equal(f.session.status().state, 'manual')
    assert.equal(f.session.context.browser().contexts().length, 1)
  }
  assert.equal(f.calls.some(call => call.url === '/erp/write'), false)
})
test('response CSP blocks worker scripts before they can initiate unreviewed requests', async t => {
  const f = await fixture(t); const grant = await f.grant()
  const result = await f.session.read(f.args(grant, 'worker'), signal())
  assert.ok(result.entries.some(entry => entry.text.includes('worker')))
  assert.equal(f.calls.some(call => call.url === '/erp/write'), false); assert.equal(f.effects(), 0)
})
test('grant identity, policy changes, expiry, budget, passive resume and restart invalidate navigation', async t => {
  const f = await fixture(t); let grant = await f.grant()
  const before = f.calls.length
  for (const change of [{ sessionId: 'stale' }, { revision: grant.revision - 1 }, { policyDigest: 'changed' }]) {
    await assert.rejects(f.session.read({ ...f.args(grant, 'stock'), ...change }, signal()), { code: 'READ_GRANT_INVALID' })
  }
  await assert.rejects(f.session.read(f.args(grant, 'write'), signal()), { code: 'READ_ROUTE_NOT_ALLOWED' })
  assert.equal(f.calls.length, before)
  f.session.readGrant.remaining = 0
  await assert.rejects(f.session.read(f.args(grant, 'stock'), signal()), { code: 'READ_GRANT_INVALID' })
  grant = await f.grant(); f.session.readGrant.expiresAt = '2000-01-01T00:00:00Z'
  await assert.rejects(f.session.read(f.args(grant, 'stock'), signal()), { code: 'READ_GRANT_INVALID' })
  grant = await f.grant()
  const checkLogin = f.session.checkLogin.bind(f.session)
  f.session.checkLogin = async page => { await checkLogin(page); f.session.readGrant.expiresAt = '2000-01-01T00:00:00Z' }
  await assert.rejects(f.session.read(f.args(grant, 'stock'), signal()), { code: 'READ_GRANT_INVALID' })
  f.session.checkLogin = checkLogin
  assert.equal(f.calls.length, before)
  grant = await f.grant()
  const resumed = await f.session.resume(grant.sessionId, grant.revision, signal())
  await assert.rejects(f.session.read({ ...f.args(grant, 'stock'), revision: resumed.revision }, signal()), { code: 'READ_GRANT_INVALID' })
  grant = await f.grant(); await writeFile(f.policyFile, JSON.stringify({ ...f.policy, reviewBasis: 'Changed review' }))
  await assert.rejects(f.session.read(f.args(grant, 'stock'), signal()), { code: 'READ_GRANT_INVALID' })
  await f.session.close(); await f.session.open({ siteUrl: f.base, scope }, signal())
  await assert.rejects(f.session.read(f.args(grant, 'stock'), signal()), { code: 'READ_GRANT_INVALID' })
})
test('cancellation and manual takeover close in-flight contexts and consume the read grant', async t => {
  const f = await fixture(t)
  for (const stage of ['creation', 'network', 'manual']) {
    const grant = await f.grant(); const controller = new AbortController()
    const before = f.calls.length
    const rejected = assert.rejects(f.session.read(f.args(grant, 'slow'), controller.signal))
    const start = Date.now()
    while (f.session.context.browser().contexts().length < 2 && Date.now() - start < 3000) await delay(10)
    assert.equal(f.session.context.browser().contexts().length, 2)
    if (stage !== 'creation') {
      while (!f.calls.slice(before).some(call => call.url === '/erp/slow') && Date.now() - start < 3000) await delay(10)
      assert.ok(f.calls.slice(before).some(call => call.url === '/erp/slow'))
    }
    if (stage === 'manual') {
      await f.session.context.pages()[0].mouse.click(100, 100)
    } else controller.abort()
    await rejected
    assert.equal(f.session.context.browser().contexts().length, 1)
    assert.equal(f.session.status().state, 'manual')
  }
  assert.equal(f.effects(), 0)
})
test('missing/malformed policy and scope mismatch fail closed; IPC accepts route IDs only', async t => {
  const f = await fixture(t)
  assert.throws(() => loadReadPolicy(undefined), { code: 'READ_POLICY_NOT_CONFIGURED' })
  for (const policy of [{ ...f.policy, routes: [{ ...f.policy.routes[0], url: 'https://other.invalid/' }] },
    { ...f.policy, requests: [{ ...f.policy.requests[0], method: '*' }] }, { ...f.policy, code: 'fetch("/write")' }]) {
    await writeFile(f.policyFile, JSON.stringify(policy)); assert.throws(() => f.session.readPolicy(), { code: 'INVALID_READ_POLICY' })
  }
  await writeFile(f.policyFile, JSON.stringify({ ...f.policy, scope: { ...scope, tenant: 'other' } }))
  await assert.rejects(f.grant(), { code: 'READ_SCOPE_MISMATCH' })
  const input = { sessionId: 'fixture', revision: 1, policyDigest: 'fixture', routeId: 'stock' }
  for (const extra of [{ url: f.base + 'write' }, { selector: '#save' }, { script: 'fetch("/write")' }, { approved: true }, { method: 'POST' }]) {
    assert.throws(() => parseRequest({ v: 1, kind: 'browser', id: 'test', method: 'browser.read', input: { ...input, ...extra } }))
  }
  const client = new WorkerClient({ browserDirectory: join(f.root, 'ipc'), browserHeadless: true, browserSandbox: false,
    browserReadPolicyFile: f.policyFile, browserResourcesDir: dirname(dirname(dirname(chromium.executablePath()))) })
  try {
    assert.equal((await client.browser('browser.readPolicy', {}, signal())).policy.id, f.policy.id)
    await assert.rejects(client.browser('browser.read', input, signal()), { code: 'READ_GRANT_INVALID' })
  } finally { await client.dispose() }
})
function agent() {
  const events = [{ type: 'turn/start' }]
  return { session: { get seq() { return events.length }, eventAt(seq) { return events[seq] }, append(type, data) { const event = { type, data }; events.push(event); return event } } }
}
test('native confirmation binds scope and contract; successful read persists evidence, denied and failed attempts do not', async t => {
  const f = await fixture(t)
  const worker = { async browser(method, input, s) {
    if (method === 'browser.open') return f.session.status()
    if (method === 'browser.readPolicy') return f.session.readPolicy()
    if (method === 'browser.readEnable') return f.session.enableRead(input, s)
    if (method === 'browser.read') return f.session.read(input, s)
    if (method === 'browser.close') return f.session.close()
    return f.session.status()
  } }
  const storage = new StorageClient({ directory: join(f.root, 'data') })
  const runtime = new BrowserRuntime(worker, storage, signal())
  const host = await mount({ inject: ['tools'], apply(ctx) { registerBrowserTools(ctx, runtime) } })
  t.after(async () => { await host.dispose(); await storage.dispose() })
  await host.run('erp_browser_open', { siteUrl: f.base, scope })
  const status = f.session.status(); const digest = f.session.readPolicy().digest
  const input = { sessionId: status.sessionId, revision: status.revision, policyDigest: digest }
  let answer = 'rejected'; const requests = []
  host.ctx.on('approval/request', async request => { requests.push(request); return answer })
  assert.equal((await host.run('erp_browser_read_enable', input)).isError, true)
  assert.equal((await host.run('erp_browser_read_enable', input, { agent: agent() })).isError, true)
  assert.equal((await storage.call('status', {})).observations, 0)
  answer = 'allowed-once'
  const granted = await host.run('erp_browser_read_enable', input, { agent: agent() })
  assert.equal(granted.isError, false, JSON.stringify(granted))
  const output = await host.run('erp_browser_read', f.args(granted.value, 'stock'))
  assert.equal(output.isError, false, JSON.stringify(output))
  assert.ok(output.value.text.includes('Receiving'))
  const saved = JSON.parse(await readFile(join(storage.directory, 'evidence', output.value.evidenceHash), 'utf8'))
  assert.ok(saved.limitations.includes(`read-policy:${digest}`))
  assert.equal((await host.run('erp_browser_read', f.args(granted.value, 'autosave'))).isError, true)
  assert.equal((await storage.call('status', {})).observations, 1)
  assert.ok(JSON.stringify(requests).includes(digest)); assert.ok(JSON.stringify(requests).includes('reviewed-fixture'))
  assert.equal(f.effects(), 0)
})

test('counterexample: a falsely reviewed GET can still mutate the server; route matching is not proof of read semantics', async t => {
  const f = await fixture(t)
  const unsafe = { ...f.policy, reviewBasis: 'INTENTIONALLY FALSE fixture review, used only to measure the trust boundary',
    requests: [{ id: 'misclassified', url: f.base + 'write', method: 'GET', body: '', contentType: '' }],
    routes: [{ id: 'misclassified', label: 'Misclassified GET', url: f.base + 'write', requests: ['misclassified'] }] }
  await writeFile(f.policyFile, JSON.stringify(unsafe))
  const grant = await f.grant()
  const result = await f.session.read(f.args(grant, 'misclassified'), signal())
  assert.equal(f.effects(), 1)
  assert.ok(result.limitations.includes('trusted-read-contract-not-automatic-side-effect-detection'))
})
