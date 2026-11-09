// Real DSH 0.2.2-rc.1 web UI, no model configured.
// Catches the one-click explore that used to leave an empty composer: the client command consumes /探索 without entering sending.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { site } from './fixtures/erp-site.mjs'

const repo = fileURLToPath(new URL('..', import.meta.url))
const node = process.execPath
const bin = join(repo, 'node_modules/@deepseek-ai/dsh/lib/bin.js')
const chrome = ['/home/ubuntu/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome', process.env.PLAYWRIGHT_CHROME]
  .find(path => path && existsSync(path))
const shots = '/opt/cursor/artifacts'

function environment(home) {
  return {
    ...process.env,
    DSH_HOME: home,
    PATH: `${join(repo, 'node_modules/.bin')}:${dirname(node)}:${process.env.PATH ?? ''}`,
    PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || '/home/ubuntu/.cache/ms-playwright',
  }
}

function command(executable, args, { cwd, env, timeout = 120_000 }) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error(`timed out: ${[executable, ...args].join(' ')}\n${out.slice(-2000)}`)) }, timeout)
    child.stdout.on('data', chunk => { out += chunk })
    child.stderr.on('data', chunk => { out += chunk })
    child.on('error', reject)
    child.on('close', code => {
      clearTimeout(timer)
      if (code === 0) resolve(out)
      else reject(new Error(`exit ${code}: ${[executable, ...args].join(' ')}\n${out.slice(-4000)}`))
    })
  })
}

function serve(args, env) {
  const child = spawn(node, args, { cwd: repo, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  child.stdout.on('data', chunk => { out += chunk })
  child.stderr.on('data', chunk => { out += chunk })
  child.output = () => out
  return child
}

function waitFor(child, pattern, timeout) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${pattern}\n${child.output().slice(-3000)}`)), timeout)
    const read = () => {
      const match = child.output().match(pattern)
      if (!match) return
      clearTimeout(timer)
      resolve(match[1] ?? match[0])
    }
    child.stdout.on('data', read)
    child.stderr.on('data', read)
    child.on('exit', () => { clearTimeout(timer); reject(new Error(`server exited\n${child.output().slice(-3000)}`)) })
    read()
  })
}

async function shot(page, name) {
  mkdirSync(shots, { recursive: true })
  await page.screenshot({ path: join(shots, name), fullPage: true }).catch(() => {})
}

async function dismiss(page) {
  for (let i = 0; i < 6; i += 1) {
    const result = await page.evaluate(() => {
      const roots = [...document.querySelectorAll('[role="presentation"], [role="dialog"]')]
      if (!roots.length) return { open: false }
      const buttons = roots.flatMap(root => [...root.querySelectorAll('button')])
      const labels = buttons.map(el => (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim())
      const button = buttons.find(el => /^(Continue|继续|Close|关闭|Get started|开始设置)$/i.test((el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim()))
      if (button) button.click()
      return { open: true, clicked: Boolean(button), labels }
    })
    if (!result.open || !result.clicked) return
    await page.waitForTimeout(400)
  }
}

async function openGuide(page) {
  const nav = page.getByRole('button', { name: /^(Adapt ERP|ERP 助手)$/ })
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await dismiss(page)
    try {
      await nav.first().click({ timeout: 2500 })
      break
    } catch (error) {
      if (attempt === 7) throw error
    }
  }
  await page.locator('section.erp-assistant').waitFor({ timeout: 15000 })
}

async function addSite(page, url, name) {
  await openGuide(page)
  const add = page.locator('section.erp-assistant button.add-hit')
  if (await add.count() && await add.first().isVisible().catch(() => false)) await add.first().click()
  await page.locator('section.erp-assistant input[type="url"]').fill(url)
  const nameBox = page.locator('section.erp-assistant form input').nth(1)
  if (name) await nameBox.fill(name)
  else await nameBox.fill('')
  await page.locator('section.erp-assistant button[type="submit"]').click()
}

async function composerText(page) {
  return page.evaluate(() => {
    const nodes = [...document.querySelectorAll('[contenteditable="true"]')]
      .filter(el => el.getBoundingClientRect().width > 40 && el.getBoundingClientRect().height > 8)
      .sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x)
    return (nodes[0]?.innerText ?? '').replace(/\u00a0/g, ' ').trim()
  })
}

async function clearComposer(page) {
  for (let i = 0; i < 4; i += 1) {
    await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('[contenteditable="true"]')]
        .filter(el => el.getBoundingClientRect().width > 40)
        .sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x)
      const el = nodes[0]
      if (!el) return
      el.focus()
      const selection = window.getSelection()
      const range = document.createRange()
      range.selectNodeContents(el)
      selection?.removeAllRanges()
      selection?.addRange(range)
    })
    await page.keyboard.press('Backspace')
    await page.waitForTimeout(200)
    if ((await composerText(page)) === '') return
  }
}

async function hostTabs(page, host) {
  const prefix = host.split('.').slice(0, 3).join('.')
  return page.evaluate(start => {
    const tabs = [...document.querySelectorAll('span[data-sidebar-right-tab]')]
      .filter(el => (el.textContent || '').includes(start))
    const unique = []
    for (const el of tabs) {
      const id = el.getAttribute('data-sidebar-right-tab')
      if (unique.some(item => item.id === id)) continue
      unique.push({ id, text: (el.textContent || '').trim().slice(0, 40) })
    }
    return unique
  }, prefix)
}

async function waitTabs(page, host, count, timeout = 12_000) {
  const start = Date.now()
  let last = []
  while (Date.now() - start < timeout) {
    last = await hostTabs(page, host)
    if (last.length === count) return last
    await page.waitForTimeout(250)
  }
  return last
}

test('rc1 web UI keeps /探索 when explore is not sent, reuses the site tab, and does not duplicate an entry URL', { timeout: 240_000 }, async t => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-erp-web-'))
  const fixture = await site()
  const children = []
  let browser
  t.after(async () => {
    await browser?.close().catch(() => {})
    for (const child of children) {
      try { process.kill(-child.pid, 'SIGTERM') } catch { try { child.kill('SIGTERM') } catch { /* already gone */ } }
    }
    await fixture.close()
    rmSync(home, { recursive: true, force: true })
  })
  const env = environment(home)
  await command(node, ['scripts/build.mjs'], { cwd: repo, env })
  await command('npm', ['pack', '--pack-destination', home, '--ignore-scripts'], { cwd: repo, env })
  const tarball = readdirSync(home).find(name => name.endsWith('.tgz'))
  assert.ok(tarball, 'npm pack produced a tarball')
  await command(node, [bin, 'plugin', '--profile', 'web', 'add', join(home, tarball)], { cwd: repo, env, timeout: 180_000 })
  // The shipped web profile leaves the sidebar Browser disabled. The official opt-in is this profile patch.
  const browserPatch = join(home, 'browser.patch.yml')
  writeFileSync(browserPatch, '- id: ui-sidebar-browser\n  disabled: false\n')
  const web = serve([bin, '--profile', 'web', '--patch', browserPatch, '--no-open', '--port', '0', '--host', '127.0.0.1'], env)
  children.push(web)
  const url = await waitFor(web, /dsh web: (http:\/\/\S+)/, 90_000)
  assert.match(url, /token=/)

  browser = await chromium.launch({
    headless: true,
    ...(chrome ? { executablePath: chrome } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'en-US' })
  const pageErrors = []
  page.on('pageerror', error => { pageErrors.push(String(error)) })
  const fail = async message => {
    await shot(page, 'rc1-failure.png')
    const text = await page.locator('body').innerText().catch(() => '')
    throw new Error(`${message}\nmodel-less page:\n${text.slice(0, 1800)}\npageerrors: ${pageErrors.slice(0, 4).join(' | ')}`)
  }
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.getByText(/Adapt ERP|ERP 助手/).first().waitFor({ timeout: 30_000 })
    await dismiss(page)
    const suite = `${fixture.origin}/suite/`
    const office = `${fixture.origin}/office/`
    await addSite(page, suite, 'Suite Local')
    await page.getByText('Suite Local').first().waitFor({ timeout: 20_000 })
    await page.waitForFunction(() => [...document.querySelectorAll('[contenteditable="true"]')].some(el => (el.innerText || '').includes('/探索')), null, { timeout: 15_000 })
    const before = await waitTabs(page, '127.0.0.1', 1)
    if (before.length !== 1) await fail(`expected one site tab after the first open, saw ${JSON.stringify(before)}`)

    await page.keyboard.press('Escape')
    await clearComposer(page)
    if ((await composerText(page)) !== '') await fail(`composer was not empty before Start exploring: ${JSON.stringify(await composerText(page))}`)
    await openGuide(page)
    await page.locator('section.erp-assistant').getByRole('button', { name: /^(Start exploring|一键探索)$/ }).click()
    try {
      await page.waitForFunction(() => {
        const editors = [...document.querySelectorAll('[contenteditable="true"]')]
        return editors.some(el => (el.innerText || '').includes('/探索'))
      }, null, { timeout: 12_000 })
    } catch { await fail('Start exploring left the composer without /探索') }
    const hint = page.locator('.erp-explore-hint').filter({ hasText: /Sign in on the right first|先在右侧浏览器登录/ })
    try { await hint.waitFor({ timeout: 8_000 }) }
    catch { await fail('Start exploring did not show the sign-in hint') }
    const draft = await composerText(page)
    assert.match(draft, /\/探索/)
    await shot(page, 'rc1-explore.png')
    const afterExplore = await waitTabs(page, '127.0.0.1', 1)
    if (afterExplore.length !== 1) await fail(`Start exploring opened another tab: ${JSON.stringify(afterExplore)}`)

    await openGuide(page)
    await page.locator('section.erp-assistant li.card').getByRole('button', { name: /^(Open|打开)$/ }).first().click()
    const afterOpen = await waitTabs(page, '127.0.0.1', 1)
    if (afterOpen.length !== 1) await fail(`Open stacked another tab: ${JSON.stringify(afterOpen)}`)
    await shot(page, 'rc1-tabs.png')

    await addSite(page, office, 'Office Local')
    await page.getByText('Office Local').first().waitFor({ timeout: 20_000 })
    await openGuide(page)
    await addSite(page, office, '')
    const duplicate = page.locator('.erp-explore-hint').filter({ hasText: /already listed|已经在列表里/ })
    try { await duplicate.waitFor({ timeout: 12_000 }) }
    catch { await fail('duplicate entry URL did not show the note on the opened site') }
    await page.getByText('Office Local').first().waitFor({ timeout: 10_000 })
    await openGuide(page)
    const names = await page.locator('section.erp-assistant ul.sites > li.card strong').allInnerTexts()
    const sites = names.map(name => name.trim()).filter(name => name && name !== 'Add a site' && name !== '添加站点')
    assert.deepEqual(sites, ['Suite Local', 'Office Local'])
    assert.equal(sites.includes('127.0.0.1'), false)
    await shot(page, 'rc1-duplicate.png')
    assert.equal(pageErrors.filter(error => !/favicon/i.test(error)).length, 0, pageErrors.join('\n'))
  } catch (error) {
    if (!String(error?.message ?? error).includes('model-less page')) await shot(page, 'rc1-failure.png')
    throw error
  }
})
