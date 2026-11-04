import test from 'node:test'
import assert from 'node:assert/strict'
import { iconDiscovered, iconFailed, iconHref, iconKey, iconLoaded, iconView, loadSiteIcons, resetSiteIcons, siteIconCandidates } from '../dist/product/favicon.js'

const page = `<!doctype html><head>
  <link rel="stylesheet" href="/app.css">
  <link rel="apple-touch-icon" href="/apple.png">
  <link rel="icon" sizes="192x192" href="/big.png?token=secret">
  <link rel="icon" type="image/png" sizes="32x32" href="/small.png">
  <link rel="icon" href="javascript:alert(1)">
  <link rel="icon" href="https://cdn.example/favicon.ico">
  <link rel="icon" href="https://user:pw@erp.example/owned.ico">
  <link rel="icon" href="data:image/svg+xml,<svg></svg>">
  <link rel="shortcut icon" href="/web/static/img/favicon.ico" />
</head>`

test('bookmark icons prefer a small same-origin link and always offer /favicon.ico', () => {
  assert.deepEqual(siteIconCandidates('https://user:secret@erp.example/app/orders/15?token=abc#code=1', page), [
    'https://erp.example/small.png',
    'https://erp.example/web/static/img/favicon.ico',
    'https://erp.example/big.png',
    'https://erp.example/apple.png',
    'https://erp.example/favicon.ico',
  ])
  assert.equal(JSON.stringify(siteIconCandidates('https://user:secret@erp.example/app/?token=abc', page)).includes('secret'), false)
  assert.equal(JSON.stringify(siteIconCandidates('https://user:secret@erp.example/app/?token=abc', page)).includes('token'), false)
  assert.deepEqual(siteIconCandidates('https://erp.example/app/'), ['https://erp.example/favicon.ico'])
  assert.deepEqual(siteIconCandidates('file:///tmp/erp'), [])
  assert.equal(iconKey('https://user:secret@erp.example/app/orders/1?token=abc'), 'https://erp.example/app/')
  assert.equal(iconKey('notaurl'), undefined)
})

test('icon links resolve against the bookmark, not another origin', () => {
  assert.deepEqual(
    siteIconCandidates('https://erp.example/app/', '<link rel="icon" href="/idp.png">', 'https://idp.example/login'),
    ['https://erp.example/favicon.ico'],
  )
  assert.deepEqual(
    siteIconCandidates('https://erp.example/app/', '<link rel="shortcut icon" href="static/favicon.png">', 'https://erp.example/app/home'),
    ['https://erp.example/app/static/favicon.png', 'https://erp.example/favicon.ico'],
  )
  const data = 'data:image/png;base64,aaaa'
  assert.equal(siteIconCandidates('https://erp.example/', `<link rel="icon" href="${data}">`)[0], data)
  assert.equal(siteIconCandidates('https://erp.example/', `<link rel="icon" href="data:image/png;base64,${'A'.repeat(5000)}">`).some(href => href.startsWith('data:')), false)
})

test('a page is fetched once per bookmark and failures stay on /favicon.ico', async () => {
  resetSiteIcons()
  let calls = 0
  const fetchHtml = async (url, init) => {
    calls++
    assert.equal(url, 'https://erp.example/app/')
    assert.equal(init.signal.aborted, false)
    return { url, contentType: 'text/html; charset=utf-8', async text() { return '<link rel="icon" href="/a.png?access_token=nope">' } }
  }
  const first = await loadSiteIcons('https://user:pw@erp.example/app/orders/9?token=1', fetchHtml)
  const second = await loadSiteIcons('https://erp.example/app/', fetchHtml)
  assert.equal(calls, 1)
  assert.deepEqual(first, ['https://erp.example/a.png', 'https://erp.example/favicon.ico'])
  assert.deepEqual(second, first)

  resetSiteIcons()
  calls = 0
  const offline = async () => { calls++; throw new Error('offline') }
  assert.deepEqual(await loadSiteIcons('https://down.example/app/orders/1?token=1', offline), ['https://down.example/favicon.ico'])
  assert.deepEqual(await loadSiteIcons('https://down.example/app/', offline), ['https://down.example/favicon.ico'])
  assert.equal(calls, 1)

  resetSiteIcons()
  const slow = await loadSiteIcons('https://slow.example/', (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
  }), 30)
  assert.deepEqual(slow, ['https://slow.example/favicon.ico'])

  resetSiteIcons()
  let released = false
  const image = await loadSiteIcons('https://files.example/', async () => ({
    url: 'https://files.example/',
    contentType: 'image/png',
    async text() { throw new Error('should not read an image') },
    async release() { released = true },
  }))
  assert.equal(released, true)
  assert.deepEqual(image, ['https://files.example/favicon.ico'])

  resetSiteIcons()
  const redirected = await loadSiteIcons('https://erp.example/', async () => ({
    url: 'https://idp.example/login',
    contentType: 'text/html',
    async text() { throw new Error('should not read the other origin') },
    async release() {},
  }))
  assert.deepEqual(redirected, ['https://erp.example/favicon.ico'])
})

test('parallel loads share one page fetch', async () => {
  resetSiteIcons()
  let calls = 0
  let open
  const gate = new Promise(resolve => { open = resolve })
  const fetchHtml = async url => {
    calls++
    await gate
    return { url, contentType: 'text/html', async text() { return '<link rel="icon" href="/a.png">' } }
  }
  const pending = Promise.all([
    loadSiteIcons('https://erp.example/app/', fetchHtml),
    loadSiteIcons('https://erp.example/app/', fetchHtml),
  ])
  await Promise.resolve()
  assert.equal(calls, 1)
  open()
  const [left, right] = await pending
  assert.deepEqual(left, ['https://erp.example/a.png', 'https://erp.example/favicon.ico'])
  assert.deepEqual(right, left)
})

test('the list keeps a loaded icon and walks past failures', () => {
  const ico = 'https://erp.example/favicon.ico'
  const better = 'https://erp.example/a.png'
  let view = iconView([ico])
  assert.equal(iconHref(view), ico)
  view = iconDiscovered(view, [better, ico], [])
  assert.deepEqual(view, { status: 'loading', hrefs: [better, ico], index: 0 })
  const ready = iconLoaded(view)
  assert.deepEqual(ready, { status: 'ready', href: better })
  assert.equal(iconDiscovered(ready, ['https://erp.example/other.png'], []), ready)
  assert.equal(iconFailed(ready), ready)

  let missed = iconFailed(iconView([ico]))
  assert.deepEqual(missed, { status: 'fallback' })
  assert.equal(iconHref(missed), undefined)
  assert.deepEqual(iconDiscovered(missed, [better, ico], [ico]), { status: 'loading', hrefs: [better], index: 0 })
  assert.deepEqual(iconDiscovered(missed, [ico], [ico]), { status: 'fallback' })

  let chain = iconView([better, ico])
  chain = iconFailed(chain)
  assert.equal(iconHref(chain), ico)
  assert.equal(iconDiscovered(chain, [better, ico], [better]), chain)
  chain = iconFailed(chain)
  assert.deepEqual(chain, { status: 'fallback' })
  assert.deepEqual(iconView([]), { status: 'fallback' })
})
