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
  assert.match(dict.zh.newChatHint, /共用这次登录/)
  assert.match(dict.en.newChatHint, /share that sign-in/)
  assert.match(dict.zh.newChatHint, /再登录/)
  assert.match(dict.en.newChatHint, /sign in again/)
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
  assert.equal(dict.zh.chooseZip, '选择 .zip 文件')
  assert.equal(dict.en.chooseZip, 'Choose .zip')
  assert.equal(dict.zh.exportPack, '导出分享包')
  assert.equal(dict.en.exportPack, 'Export share pack')
  assert.equal(dict.zh.addSite, '添加站点')
  assert.equal(dict.en.addSite, 'Add a site')
  assert.match(dict.zh.newChatHint, /站点入口/)
  assert.match(dict.en.newChatHint, /site entry/)
  assert.match(dict.zh.importDrop, /\.zip/)
  assert.match(dict.en.importDrop, /\.zip/)
  assert.equal(dict.zh.url, '网址')
  assert.equal(dict.en.url, 'URL')
  assert.equal(dict.zh.name, '显示名')
  assert.equal(dict.en.name, 'Display name')
  assert.match(dict.zh.channel, /ERP 助手/)
  assert.match(dict.en.channel, /Adapt ERP/)
  assert.match(dict.zh.explorePartial, /未完成的范围保持未完成/)
  assert.match(dict.en.explorePartial, /Unfinished scope stays unfinished/)
  assert.equal(code.includes('Choose File'), false)
  assert.equal(code.includes('No file chosen'), false)
  assert.match(code, /file-input/)
  assert.match(code, /opacity:0/)
  assert.match(code, /onDrop/)
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
  const openedTabs = []
  let snapshot = { phase: 'pending', ids: [], byId: {} }
  let shown
  const listListeners = new Set()
  const shownListeners = new Set()
  const stopWatch = exports.watchWorkspaceSessions({
    sessions: { list: {
      getSnapshot: () => snapshot,
      subscribe(listener) { listListeners.add(listener); return () => listListeners.delete(listener) },
    } },
    sidebar: {
      openTab(kind, options) { openedTabs.push([shown, kind, options.params.url]) },
      mounted: {
        getSnapshot: () => shown,
        subscribe(listener) { shownListeners.add(listener); return () => shownListeners.delete(listener) },
      },
    },
    layout: { selectPanel() {}, panels: { setRightbar(px) { widths.push(px) } } },
    async sites() { return [{ workspaceDir: '/tmp/erp-a/', entryUrl: 'https://erp.example/app/' }] },
  })
  const drain = () => new Promise(resolve => { setImmediate(resolve) })
  snapshot = { phase: 'ready', ids: ['old'], byId: { old: { cwd: '/tmp/erp-a' } } }
  for (const listener of listListeners) listener()
  await drain()
  assert.deepEqual(openedTabs, [])
  snapshot = {
    phase: 'ready',
    ids: ['old', 'new', 'other', 'child'],
    byId: {
      old: { cwd: '/tmp/erp-a' },
      new: { cwd: '/tmp/erp-a' },
      other: { cwd: '/tmp/other' },
      child: { cwd: '/tmp/erp-a', origin: 'subagent' },
    },
  }
  shown = 'old'
  for (const listener of listListeners) listener()
  await drain()
  assert.deepEqual(openedTabs, [])
  shown = 'new'
  for (const listener of shownListeners) listener()
  assert.deepEqual(openedTabs, [['new', 'browser', 'https://erp.example/app/']])
  shown = 'other'
  for (const listener of shownListeners) listener()
  shown = 'child'
  for (const listener of shownListeners) listener()
  assert.equal(openedTabs.length, 1)
  assert.equal(widths.length, 1)
  stopWatch()
})

test('the guide panel is cards and the share pack control is not the browser file chrome', async () => {
  const code = readFileSync(new URL('../dist/client.js', import.meta.url), 'utf8')
  let registered
  const context = {
    window: { innerWidth: 1400, __ModuleLoader__: { load(entry) { registered = entry } } },
    console,
    btoa: globalThis.btoa,
    atob: globalThis.atob,
    Uint8Array,
  }
  vm.createContext(context)
  vm.runInContext(code, context)
  let preset = null
  let cursor = 0
  const react = {
    useEffect() {},
    useRef(value) { return { current: value } },
    useState(initial) {
      if (!preset) return [typeof initial === 'function' ? initial() : initial, () => {}]
      const value = cursor < preset.length ? preset[cursor] : (typeof initial === 'function' ? initial() : initial)
      cursor += 1
      return [value, () => {}]
    },
  }
  function element(type, props) {
    return { type, props: props ?? {} }
  }
  const exports = registered.factory(spec => {
    if (spec === 'react') return react
    if (spec === 'react/jsx-runtime') return { jsx: element, jsxs: element, Fragment: Symbol.for('react.fragment') }
    throw new Error(`unexpected require ${spec}`)
  })
  const dict = {}
  let guide
  const calls = []
  const ctx = {
    effect(fn) { fn() },
    get(name) {
      if (name === 'connection') return { rpc: { async call(_channel, _endpoint, body) {
        calls.push(body)
        return { ok: true, value: { sites: [], imported: { warnings: [] } } }
      } } }
      return undefined
    },
    locale: {
      register(_ns, dicts) { Object.assign(dict, dicts); return () => {} },
      bind() { return key => dict.zh[key] },
    },
    slots: {
      inject(_name, register) { register() },
      register(options, component) {
        if (options.name === 'main') guide = component
        return () => {}
      },
    },
  }
  exports.apply(ctx)
  const site = { id: 'site_a', name: 'sg-pf', entryUrl: 'https://pftest.example/manage/', workspaceDir: '/tmp/a', sessionId: 'sess-1' }
  // Guide's useState order: sites, lastOpenedId, name, url, editing, error, status, busy, adding, dragOver, importFile, importNote, importBad, ready.
  const guideState = (sites, ready) => [sites, sites[0]?.id ?? '', '', '', '', '', '', false, false, false, '', '', false, ready]
  function collect(next) {
    preset = next
    cursor = 0
    const nodes = []
    const walk = node => {
      if (node == null || typeof node !== 'object') return
      if (Array.isArray(node)) { for (const item of node) walk(item); return }
      if (typeof node.type === 'function') { walk(node.type(node.props ?? {})); return }
      nodes.push(node)
      walk(node.props.children)
    }
    walk(element(guide, {}))
    return nodes
  }
  const text = node => {
    if (node == null || node === false || node === true) return ''
    if (typeof node === 'string' || typeof node === 'number') return String(node)
    if (Array.isArray(node)) return node.map(text).join('')
    if (typeof node.type === 'function') return ''
    return text(node.props?.children)
  }
  const buttonLabel = node => {
    const kids = node.props?.children
    const parts = Array.isArray(kids) ? kids : [kids]
    const direct = parts.filter(item => typeof item === 'string' || typeof item === 'number').map(String).join('')
    if (direct) return direct
    const strong = parts.find(item => item && item.type === 'strong')
    return strong ? text(strong) : text(node)
  }
  const buttons = nodes => nodes.filter(node => node.type === 'button').map(node => ({ label: buttonLabel(node), className: String(node.props.className ?? ''), title: node.props.title }))
  const first = collect(guideState([], true))
  const firstButtons = buttons(first)
  assert.equal(firstButtons.some(button => button.label === '选择 .zip 文件'), false)
  assert.equal(first.some(node => node.type === 'input' && node.props.type === 'file'), false)
  assert.equal(firstButtons.some(button => button.label === '添加'), true)
  assert.ok(first.some(node => String(node.props.className ?? '').includes('add-card open')))
  assert.ok(first.some(node => text(node).includes('索引还留在这台机器上')))
  const nodes = collect(guideState([site], true))
  const labels = buttons(nodes)
  const byLabel = label => labels.find(button => button.label === label)
  assert.equal(byLabel('继续').className.includes('primary'), true)
  assert.equal(byLabel('打开').className.includes('primary'), true)
  assert.equal(byLabel('选择 .zip 文件').className.includes('primary'), true)
  assert.equal(byLabel('新对话').className.includes('link'), true)
  assert.equal(byLabel('新对话').title, dict.zh.newChatHint)
  assert.equal(byLabel('一键探索').className.includes('link'), true)
  assert.equal(byLabel('导出分享包').className.includes('link'), true)
  assert.equal(byLabel('分享').className.includes('link'), true)
  assert.equal(byLabel('编辑').className.includes('link'), true)
  assert.equal(byLabel('移除').className.includes('danger'), true)
  assert.equal(byLabel('添加'), undefined)
  assert.equal(byLabel('添加站点').className.includes('add-hit'), true)
  const file = nodes.find(node => node.type === 'input' && node.props.type === 'file')
  assert.equal(file.props.className, 'file-input')
  assert.equal(file.props.accept, '.zip,application/zip')
  assert.equal(String(file.props['aria-hidden']), 'true')
  assert.equal(file.props.tabIndex, -1)
  const zone = nodes.find(node => String(node.props.className ?? '').split(' ').includes('drop'))
  assert.equal(typeof zone.props.onDrop, 'function')
  const joined = nodes.map(text).join('\n')
  assert.equal(joined.includes('Choose File'), false)
  assert.equal(joined.includes('No file chosen'), false)
  assert.ok(joined.includes(dict.zh.importDrop))
  assert.ok(joined.includes(dict.zh.newChatHint))
  function zip(name, size = 4) {
    return { name, type: name.endsWith('.zip') ? 'application/zip' : 'text/plain', async arrayBuffer() { return new Uint8Array(size).buffer } }
  }
  const flush = () => new Promise(resolve => setImmediate(resolve))
  await zone.props.onDrop({ preventDefault() {}, dataTransfer: { files: [zip('notes.txt')] } })
  await flush()
  assert.equal(calls.length, 0)
  await zone.props.onDrop({ preventDefault() {}, dataTransfer: { files: [zip('pack.zip')] } })
  await flush()
  assert.equal(calls.length, 1)
  assert.equal(calls[0].op, 'import-pack')
  assert.equal(calls[0].id, 'site_a')
  assert.equal(typeof calls[0].bytes, 'string')
  assert.equal(calls[0].bytes.length > 0, true)
  const target = { files: [zip('again.zip')], value: 'picked' }
  await file.props.onChange({ currentTarget: target })
  await flush()
  assert.equal(target.value, '')
  assert.equal(calls[1].op, 'import-pack')
  assert.equal(calls.length, 2)
  await file.props.onChange({ currentTarget: { files: [zip('huge.zip', 16_000_001)], value: 'huge' } })
  await flush()
  assert.equal(calls.length, 2)
})

test('start exploring submits /探索 when remote.commands is not injected', async () => {
  const code = readFileSync(new URL('../dist/client.js', import.meta.url), 'utf8')
  let registered
  const context = {
    window: { innerWidth: 1400, __ModuleLoader__: { load(entry) { registered = entry } } },
    console,
    setTimeout,
    clearTimeout,
  }
  vm.createContext(context)
  vm.runInContext(code, context)
  let preset = null
  let cursor = 0
  const react = {
    useEffect() {},
    useRef(value) { return { current: value } },
    useState(initial) {
      if (!preset) return [typeof initial === 'function' ? initial() : initial, () => {}]
      const value = cursor < preset.length ? preset[cursor] : (typeof initial === 'function' ? initial() : initial)
      cursor += 1
      return [value, () => {}]
    },
  }
  function element(type, props) {
    return { type, props: props ?? {} }
  }
  const exports = registered.factory(spec => {
    if (spec === 'react') return react
    if (spec === 'react/jsx-runtime') return { jsx: element, jsxs: element, Fragment: Symbol.for('react.fragment') }
    throw new Error(`unexpected require ${spec}`)
  })
  const dict = {}
  let guide
  let hint
  const slash = []
  const site = { id: 'site_a', name: 'sg-pf', entryUrl: 'https://pftest.example/manage/', workspaceDir: '/tmp/a', sessionId: 'sess-1' }
  const guideState = (sites, ready) => [sites, sites[0]?.id ?? '', '', '', '', '', '', false, false, false, '', '', false, ready]
  const drafts = []
  const submitted = []
  const executed = []
  const rejected = []
  let bindingReady = false
  let remoteMode = 'throw'
  const onRejection = reason => { rejected.push(reason) }
  process.on('unhandledRejection', onRejection)
  const INJECT = 'cannot get property "remote.commands" without inject'
  const ctx = {
    effect(fn) { fn() },
    inject(_names, plugin) { plugin(ctx) },
    get(name) {
      if (name === 'connection') return { rpc: { async call() { return { ok: true, value: { sites: [site], lastOpenedId: site.id } } } } }
      if (name === 'layout') return { selectPanel() {}, panels: { setRightbar() {} } }
      if (name === 'uiWorkspace') return { openSession() {} }
      if (name === 'sidebarRight') return { openTab() {}, mounted: { getSnapshot: () => 'sess-1', subscribe() { return () => {} } } }
      if (name === 'workspaces') return { async create() { return { workspaceId: 'ws-1', path: site.workspaceDir, title: site.name, sessionIds: ['sess-1'] } } }
      if (name === 'sessions') return {
        binding(id) { return bindingReady ? { ctx: { id } } : undefined },
        scope(id) { return bindingReady ? { id } : undefined },
      }
      if (name === 'conversation') return {
        input: { for() { return { setDraft(text) { drafts.push(text) }, submit() { submitted.push(drafts.at(-1)) } } } },
      }
      if (name === 'commandUi') return { register(contribution) { slash.push(contribution); return () => {} } }
      if (name === 'remote.commands' || name === 'remote') {
        if (remoteMode === 'throw') throw new Error(INJECT)
        if (remoteMode === 'missing') return undefined
        if (remoteMode === 'getter' && name === 'remote') {
          return { get commands() { throw new Error(INJECT) } }
        }
        if (remoteMode === 'present' && name === 'remote.commands') {
          return { async execute(sessionId, line, attachments) { executed.push([sessionId, line, attachments]) } }
        }
        return undefined
      }
      return undefined
    },
    locale: {
      register(_ns, dicts) { Object.assign(dict, dicts); return () => {} },
      bind() { return key => dict.zh[key] },
    },
    slots: {
      inject(_name, register) { register() },
      register(options, component) {
        if (options.name === 'main') guide = component
        if (options.id === 'erp-explore-hint') hint = component
        return () => {}
      },
    },
  }
  function collect(node) {
    const nodes = []
    const walk = current => {
      if (current == null || typeof current !== 'object') return
      if (Array.isArray(current)) { for (const item of current) walk(item); return }
      if (typeof current.type === 'function') { walk(current.type(current.props ?? {})); return }
      nodes.push(current)
      walk(current.props.children)
    }
    walk(node)
    return nodes
  }
  try {
    exports.apply(ctx)
    assert.deepEqual(slash.map(item => item.name), ['探索', '更新探索'])
    preset = guideState([site], true)
    cursor = 0
    const explore = collect(element(guide, {})).find(node => node.type === 'button' && node.props.children === '一键探索')
    assert.equal(typeof explore.props.onClick, 'function')
    bindingReady = false
    explore.props.onClick()
    await new Promise(resolve => { setTimeout(resolve, 50) })
    assert.deepEqual(drafts, [])
    bindingReady = true
    await new Promise(resolve => { setTimeout(resolve, 80) })
    assert.deepEqual(drafts, ['/探索'])
    assert.deepEqual(submitted, ['/探索'])
    assert.deepEqual(executed, [])
    assert.deepEqual(rejected, [])

    drafts.length = 0
    submitted.length = 0
    remoteMode = 'getter'
    const exploreAction = slash.find(item => item.name === '探索')
    exploreAction.ui.run({ sessionId: 'sess-1' })
    await new Promise(resolve => { setTimeout(resolve, 20) })
    assert.deepEqual(drafts, ['/explore'])
    assert.deepEqual(submitted, ['/explore'])
    assert.deepEqual(rejected, [])
    const updateAction = slash.find(item => item.name === '更新探索')
    drafts.length = 0
    submitted.length = 0
    updateAction.ui.run({ sessionId: 'sess-1' })
    await new Promise(resolve => { setTimeout(resolve, 20) })
    assert.deepEqual(submitted, ['/explore-update'])

    drafts.length = 0
    submitted.length = 0
    executed.length = 0
    bindingReady = false
    remoteMode = 'present'
    cursor = 0
    collect(element(guide, {})).find(node => node.type === 'button' && node.props.children === '一键探索').props.onClick()
    await new Promise(resolve => { setTimeout(resolve, 500) })
    assert.deepEqual(drafts, [])
    assert.equal(executed.length, 1)
    assert.equal(executed[0][0], 'sess-1')
    assert.equal(executed[0][1], '/explore')
    assert.equal(JSON.stringify([...executed[0][2]]), '[]')
    assert.deepEqual(rejected, [])

    executed.length = 0
    preset = null
    cursor = 0
    assert.equal(collect(element(hint, {})).some(node => node.type === 'p'), false)
    remoteMode = 'throw'
    cursor = 0
    preset = guideState([site], true)
    collect(element(guide, {})).find(node => node.type === 'button' && node.props.children === '一键探索').props.onClick()
    await new Promise(resolve => { setTimeout(resolve, 500) })
    assert.deepEqual(executed, [])
    assert.deepEqual(drafts, [])
    assert.deepEqual(rejected, [])
    preset = null
    cursor = 0
    const hintNodes = collect(element(hint, {}))
    assert.equal(hintNodes.some(node => node.type === 'p' && node.props.children === dict.zh.exploreHint), true)
  } finally {
    process.off('unhandledRejection', onRejection)
  }
})
