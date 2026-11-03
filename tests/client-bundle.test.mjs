import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

test('the client bundle registers ERP 助手 and opens the official sidebar browser', async () => {
  const code = readFileSync(new URL('../dist/client.js', import.meta.url), 'utf8')
  let registered
  const context = { window: { __ModuleLoader__: { load(entry) { registered = entry } } }, console }
  vm.createContext(context)
  vm.runInContext(code, context)
  assert.equal(registered.id, '@guosheng_047/dsh-erp')
  const seen = new Set()
  const react = { useEffect() {}, useState(value) { return [value, () => {}] } }
  const exports = registered.factory(spec => {
    seen.add(spec)
    if (spec === 'react') return react
    if (spec === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null, Fragment: Symbol.for('react.fragment') }
    throw new Error(`unexpected require ${spec}`)
  })
  assert.deepEqual([...seen], ['react', 'react/jsx-runtime'])
  assert.equal(typeof exports.apply, 'function')
  assert.equal(exports.inject.join(','), 'slots,locale')
  const dict = {}
  let lang = 'zh'
  const regs = []
  const ctx = {
    effect(fn) { fn() },
    get() { return undefined },
    locale: {
      register(_ns, dicts) { Object.assign(dict, dicts); return () => {} },
      bind() { return key => dict[lang][key] },
    },
    slots: {
      inject(_name, register) { register() },
      register(options, component) { regs.push({ options, component }); return () => {} },
    },
  }
  exports.apply(ctx)
  const entry = regs.find(item => item.options.name === 'sidebar.panellist')
  const guide = regs.find(item => item.options.name === 'main')
  assert.equal(entry.options.id, 'erp-assistant')
  assert.equal(entry.options.label(), 'ERP 助手')
  assert.notEqual(dict.zh.firstRun, dict.zh.returning)
  assert.equal(dict.zh.continue, '继续')
  assert.match(dict.zh.continueHint, /入口网址/)
  assert.equal(dict.zh.password.includes('密码'), true)
  lang = 'en'
  assert.equal(entry.options.label(), 'Adapt ERP')
  assert.equal(dict.en.continue, 'Continue')
  assert.notEqual(dict.en.firstRun, dict.en.returning)
  assert.equal(guide.options.key, 'erp-assistant')
  const calls = []
  const sessionId = await exports.openErpSite({
    sessions: { async create() { return 'sess-1' } },
    uiWorkspace: { openSession(id) { calls.push(['session', id]) } },
    layout: { selectPanel(id) { calls.push(['panel', id]) } },
    sidebar: { openTab(kind, options) { calls.push(['tab', kind, options]) } },
    async bind(siteId, id) { calls.push(['bind', siteId, id]) },
  }, { id: 'site_a', entryUrl: 'https://erp.example/app/', workspaceDir: '/tmp/erp-a', name: 'Alpha', account: 'work' })
  assert.equal(sessionId, 'sess-1')
  assert.equal(JSON.stringify(calls), JSON.stringify([
    ['bind', 'site_a', 'sess-1'],
    ['session', 'sess-1'],
    ['panel', null],
    ['tab', 'browser', { params: { url: 'https://erp.example/app/' } }],
  ]))
  calls.length = 0
  await exports.openErpSite({
    sessions: { async create() { throw new Error('should reuse the bound session') } },
    uiWorkspace: { openSession(id) { calls.push(['session', id]) } },
    layout: { selectPanel(id) { calls.push(['panel', id]) } },
    sidebar: { openTab(kind, options) { calls.push(['tab', kind, options]) } },
    async bind() { throw new Error('should not rebind') },
  }, { id: 'site_b', entryUrl: 'https://other.example/app/', workspaceDir: '/tmp/erp-b', sessionId: 'sess-2' })
  assert.equal(JSON.stringify(calls.map(call => call[0] === 'tab' ? call[2].params.url : call[1])), JSON.stringify(['sess-2', null, 'https://other.example/app/']))
})
