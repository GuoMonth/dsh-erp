import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

test('the client bundle registers ERP 助手 and opens the official sidebar browser', async () => {
  const code = readFileSync(new URL('../dist/client.js', import.meta.url), 'utf8')
  assert.doesNotMatch(code, /账户标签|Account label|应用根地址|Application root/)
  assert.doesNotMatch(code, /type:"password"|type: "password"/)
  let registered
  const context = { window: { innerWidth: 1400, __ModuleLoader__: { load(entry) { registered = entry } } }, console }
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
  assert.match(dict.zh.continueHint, /入口/)
  assert.equal(dict.zh.explore, '一键探索')
  assert.equal(dict.en.explore, 'Start exploring')
  assert.match(dict.zh.exploreHint, /\/探索/)
  assert.match(dict.en.exploreHint, /\/探索/)
  assert.equal(dict.zh.exploreCommand, '探索')
  assert.equal(dict.en.exploreCommand, 'Explore')
  assert.match(dict.zh.updateCommandHint, /覆盖/)
  assert.match(dict.en.updateCommandHint, /covers the previous explore/)
  assert.match(code, /setRightbar/)
  assert.match(code, /explore-update/)
  assert.match(code, /更新探索/)
  assert.equal(dict.zh.newChat, '新对话')
  assert.equal(dict.zh.password.includes('密码'), true)
  const slots = value => [...value.matchAll(/\{[a-z]+\}/g)].map(match => match[0]).sort()
  assert.deepEqual(Object.keys(dict.zh).sort(), Object.keys(dict.en).sort())
  for (const key of Object.keys(dict.zh)) {
    assert.equal(dict.zh[key].trim().length > 0, true, key)
    assert.equal(dict.en[key].trim().length > 0, true, key)
    assert.deepEqual(slots(dict.zh[key]), slots(dict.en[key]), key)
  }
  assert.match(dict.zh.saved, /索引还留在这台机器上/)
  assert.match(dict.en.saved, /index stays on this machine/)
  assert.match(dict.zh.saved, /工作区文件夹/)
  assert.match(dict.en.saved, /workspace folder/)
  assert.equal(dict.zh.importPack, '导入分享包')
  assert.equal(dict.en.importPack, 'Import share pack')
  assert.equal(dict.zh.url, '网址')
  assert.equal(dict.en.url, 'URL')
  assert.equal(dict.zh.name, '显示名')
  assert.equal(dict.en.name, 'Display name')
  assert.match(dict.zh.channel, /ERP 助手/)
  assert.match(dict.en.channel, /Adapt ERP/)
  assert.match(dict.zh.explorePartial, /未完成的范围保持未完成/)
  assert.match(dict.en.explorePartial, /Unfinished scope stays unfinished/)
  assert.equal(code.includes('Choose File'), false)
  assert.match(code, /data-erp-favicon/)
  assert.match(code, /\/favicon\.ico/)
  assert.match(code, /credentials:\s*["']omit["']/)
  assert.match(code, /no-referrer/)
  assert.doesNotMatch(code, /credentials:\s*["']include["']/)
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
  calls.length = 0
  const fresh = []
  await exports.openErpSite({
    sessions: { async create(input) { fresh.push(input.cwd); return 'sess-3' } },
    uiWorkspace: { openSession(id) { calls.push(['session', id]) } },
    layout: { selectPanel(id) { calls.push(['panel', id]) } },
    sidebar: { openTab(kind, options) { calls.push(['tab', kind, options]) } },
    workspaces: { async create(input) { fresh.push(input.path) } },
    async bind(siteId, id) { calls.push(['bind', siteId, id]) },
  }, { id: 'site_a', entryUrl: 'https://erp.example/app/', workspaceDir: '/tmp/erp-a', sessionId: 'sess-1' }, { fresh: true })
  assert.deepEqual(fresh, ['/tmp/erp-a', '/tmp/erp-a'])
  assert.equal(calls[0][2], 'sess-3')
  const titled = []
  const drafted = []
  const widths = []
  const opened = await exports.openErpSite({
    sessions: {
      async create() { throw new Error('openWorkspace creates the session') },
      binding(id) { return { id } },
    },
    uiWorkspace: {
      openSession() { throw new Error('a new site is not a member yet') },
      async openWorkspace(id, before) { titled.push(['open', id]); before('sess-new') },
    },
    layout: {
      selectPanel(id) { titled.push(['panel', id]) },
      panels: { setRightbar(px) { widths.push(px) } },
    },
    sidebar: { openTab(kind, options) { titled.push(['tab', kind, options.params.url]) } },
    workspaces: {
      async create(input) { return { workspaceId: 'ws-1', path: input.path, title: 'site_abc', sessionIds: [] } },
      async rename(id, title) { titled.push(['rename', id, title]); return { workspaceId: id, path: '/tmp/erp-a', title, sessionIds: [] } },
    },
    conversation: { input: { requestDraftInitialization(binding, options) { drafted.push([binding.id, options.prompt, options.whenDraftExists]) } } },
    hint(id) { drafted.push(['hint', id]) },
    async bind(siteId, id) { titled.push(['bind', siteId, id]) },
  }, { id: 'site_a', entryUrl: 'https://erp.example/app/', workspaceDir: '/tmp/erp-a', name: 'Alpha' }, { prefill: '/探索' })
  assert.equal(opened, 'sess-new')
  assert.deepEqual(titled, [
    ['rename', 'ws-1', 'Alpha'],
    ['open', 'ws-1'],
    ['bind', 'site_a', 'sess-new'],
    ['panel', null],
    ['tab', 'browser', 'https://erp.example/app/'],
  ])
  assert.deepEqual(drafted, [['hint', 'sess-new'], ['sess-new', '/探索', 'keep']])
  assert.deepEqual(widths, [Math.round((1400 - 280) * 0.7)])
  await exports.openErpSite({
    sessions: { async create() { throw new Error('member session is restored') } },
    uiWorkspace: {
      openSession(id) { titled.push(['session', id]) },
      async openWorkspace() { throw new Error('member session stays open') },
    },
    layout: { selectPanel(id) { titled.push(['panel', id]) }, panels: { setRightbar(px) { widths.push(px) } } },
    sidebar: { openTab(_kind, options) { titled.push(['tab', options.params.url]) } },
    workspaces: {
      async create() { return { workspaceId: 'ws-1', path: '/tmp/erp-a', title: 'Alpha', sessionIds: ['sess-1'] } },
      async rename() { throw new Error('title already matches') },
    },
    async bind() { throw new Error('already bound') },
  }, { id: 'site_a', entryUrl: 'https://erp.example/app/', workspaceDir: '/tmp/erp-a', name: 'Alpha', sessionId: 'sess-1' })
  assert.deepEqual(titled.slice(-3), [['session', 'sess-1'], ['panel', null], ['tab', 'https://erp.example/app/']])
  assert.equal(widths.length, 1)
})
