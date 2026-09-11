import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

async function installerFixture(t, cancel) {
  const directory = await mkdtemp(join(tmpdir(), 'erp-browser-download-'))
  const server = createServer((_req, res) => {
    if (cancel) return
    res.writeHead(200, { 'content-type': 'application/zip', 'content-length': 4 }); res.end('bad!')
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  t.after(async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); await rm(directory, { recursive: true, force: true }) })
  const source = `import {prepareBrowser} from ${JSON.stringify(new URL('../dist/browser/resources.js', import.meta.url).href)};
    const controller = new AbortController();
    ${cancel ? 'setTimeout(() => controller.abort(), 200);' : ''}
    try { await prepareBrowser(controller.signal); process.stdout.write('unexpected-success') }
    catch (error) { process.stdout.write(error.code || 'unexpected-error') }`
  const child = spawn(process.execPath, ['--input-type=module', '-e', source], {
    env: { PATH: process.env.PATH, PLAYWRIGHT_BROWSERS_PATH: directory,
      PLAYWRIGHT_DOWNLOAD_HOST: `http://127.0.0.1:${server.address().port}` },
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  const timer = setTimeout(() => child.kill('SIGKILL'), 15_000)
  t.after(() => clearTimeout(timer))
  let output = ''; child.stdout.on('data', chunk => { output += chunk.toString() })
  const [code] = await once(child, 'close'); assert.equal(code, 0)
  return output
}
test('managed browser preparation rejects corrupt archives with a retryable error', async t => {
  assert.equal(await installerFixture(t, false), 'BROWSER_INSTALL_FAILED_RETRY')
})
test('managed browser preparation settles cancellation after installer shutdown', async t => {
  assert.equal(await installerFixture(t, true), 'CANCELLED')
})
