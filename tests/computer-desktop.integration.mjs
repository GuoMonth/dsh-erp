import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { chromium } from 'playwright'
import { Context } from '@deepseek-ai/cordis'
import ComputerUse from '@deepseek-ai/dsh-computer-use'
import Tools from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as Native from '@deepseek-ai/dsh-experimental-computer-use-cua-driver-native'
import { ToolCallId } from '@deepseek-ai/dsh-llm'

// Run explicitly inside an isolated Xvfb display; never send fixture input to the user's desktop.
test('native Cua observes a real X11 window, clicks in background and reobserves the independently verified outcome',
  { timeout: 30000, skip: process.env.ERP_CUA_DESKTOP_E2E !== '1' }, async t => {
    assert.equal(process.platform, 'linux'); assert.ok(process.env.DISPLAY)
    const ctx = new Context()
    let server, browser
    t.after(async () => { await ctx.fiber.dispose(); await browser?.close(); await server?.close() })
    await ctx.plugin(ComputerUse); await ctx.plugin(Tools); await ctx.plugin(SystemPrompt); await ctx.plugin(Native)
    let sequence = 0
    const run = (name, args = {}) => ctx.tools.execute({ name: `cua_driver_native__${name}`, arguments: args,
      signal: new AbortController().signal, callId: ToolCallId(`desktop-${++sequence}`) })
    assert.equal((await run('check_permissions', { prompt: false })).isError, false)
    server = await chromium.launchServer({ executablePath: chromium.executablePath(), headless: false,
      args: ['--no-sandbox', '--force-renderer-accessibility'] })
    browser = await chromium.connect(server.wsEndpoint())
    const page = await browser.newPage()
    await page.setContent('<title>Cua isolated fixture</title><button style="width:320px;height:180px;margin:64px" onclick="this.outerHTML=\'<p>Cua outcome checked</p>\'">Cua fixture Continue</button>')
    const pid = server.process().pid
    const windows = await run('list_windows', { pid }); assert.equal(windows.isError, false, JSON.stringify(windows.content))
    const window = windows.value.structuredContent.windows.find(window => window.pid === pid)
    assert.ok(window); const target = { pid, window_id: window.window_id }
    // Use the full-size window screenshot: resized previews must not become unscaled input coordinates.
    const before = await run('get_window_state', { ...target, max_elements: 80 })
    assert.equal(before.isError, false, JSON.stringify(before.content))
    const firstImage = before.value.content.find(block => block.type === 'image'); assert.ok(firstImage)
    assert.equal(firstImage.mimeType, 'image/png')
    const rectangle = await page.getByRole('button', { name: 'Cua fixture Continue' }).boundingBox(); assert.ok(rectangle)
    const header = await page.evaluate(() => window.outerHeight - window.innerHeight)
    const clicked = await run('click', { ...target, delivery_mode: 'background',
      x: rectangle.x + rectangle.width / 2, y: header + rectangle.y + rectangle.height / 2 })
    assert.equal(clicked.isError, false, JSON.stringify(clicked.content))
    // Independent fixture readback proves the click took effect, beyond the driver's delivery receipt.
    await page.getByText('Cua outcome checked').waitFor({ timeout: 5000 })
    const after = await run('get_window_state', target)
    assert.equal(after.isError, false, JSON.stringify(after.content))
    const secondImage = after.value.content.find(block => block.type === 'image'); assert.ok(secondImage)
    const hash = image => createHash('sha256').update(image.data).digest('hex')
    assert.notEqual(hash(firstImage), hash(secondImage), 'fresh native window pixels must reflect the fixture change')
  })
