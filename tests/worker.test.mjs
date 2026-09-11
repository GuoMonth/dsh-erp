import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { WorkerClient } from '../dist/worker-client.js'
import { assertRuntime } from '../dist/runtime-version.js'
import { parseRequest, parseResponse } from '../dist/protocol.js'
const signal = () => new AbortController().signal
const gone = pid => assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })

test('runtime rejects unsupported majors and older Node 24 releases', () => {
  for (const version of ['22.20.0', '25.0.0', '24.17.1', 'invalid']) assert.throws(() => assertRuntime(version))
  assert.doesNotThrow(() => assertRuntime('24.18.0'))
})
test('IPC rejects unexpected shapes, protocol versions and operation names', () => {
  for (const message of [{ v: 2, kind: 'ready' }, { v: 1, kind: 'ready', token: 'private' }, null]) assert.throws(() => parseResponse(message))
  assert.throws(() => parseRequest({ v: 1, kind: 'request', id: 'a', method: 'eval', delayMs: 0 }))
})
test('worker is reusable, bounded and disposed without orphaning', async t => {
  const client = new WorkerClient()
  t.after(() => client.dispose())
  const first = await client.health(signal())
  assert.notEqual(first.pid, process.pid)
  const pending = client.health(signal(), 100)
  await assert.rejects(client.health(signal()), { code: 'WORKER_BUSY' })
  assert.equal((await pending).pid, first.pid)
  await client.dispose()
  gone(first.pid)
  await assert.rejects(client.health(signal()), { code: 'WORKER_CLOSED' })
})
test('cancellation settles after cooperative work stops and leaves channel reusable', async t => {
  const client = new WorkerClient()
  t.after(() => client.dispose())
  await client.health(signal())
  const controller = new AbortController()
  const pending = client.health(controller.signal, 10_000)
  const rejected = assert.rejects(pending, { code: 'CANCELLED' })
  await delay(30)
  controller.abort()
  await rejected
  assert.equal((await client.health(signal())).pid, client.pid)
})
test('timeout cancels work instead of silently retrying it', async t => {
  const client = new WorkerClient({ timeoutMs: 50 })
  t.after(() => client.dispose())
  await client.health(signal())
  await assert.rejects(client.health(signal(), 10_000), { code: 'WORKER_TIMEOUT' })
  await client.health(signal())
})
test('crash fails the pending call; the next explicit call starts a new process', async t => {
  const client = new WorkerClient()
  t.after(() => client.dispose())
  const first = await client.health(signal())
  const rejected = assert.rejects(client.health(signal(), 10_000), { code: 'WORKER_EXITED' })
  await delay(30)
  process.kill(first.pid, 'SIGKILL')
  await rejected
  const next = await client.health(signal())
  assert.notEqual(next.pid, first.pid)
})
test('disposal drains an in-flight call and refuses subsequent work', async () => {
  const client = new WorkerClient()
  const first = await client.health(signal())
  const rejected = assert.rejects(client.health(signal(), 10_000), { code: 'WORKER_CLOSED' })
  await delay(20)
  await client.dispose()
  await rejected
  gone(first.pid)
})
test('startup cancellation cleans the process before rejecting', async () => {
  const client = new WorkerClient()
  const controller = new AbortController()
  const pending = client.health(controller.signal)
  const pid = client.pid
  const rejected = assert.rejects(pending)
  controller.abort()
  await rejected
  gone(pid)
  await client.dispose()
})
test('non-cooperative worker is killed before cancellation completes; env keys are excluded', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'erp-worker-test-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const file = join(dir, 'stubborn.mjs')
  await writeFile(file, `
    if (process.env.ERP_TEST_SECRET || process.env.NODE_OPTIONS || process.execArgv.length) process.exit(9)
    process.on('SIGTERM', () => {})
    process.on('message', () => {})
    process.send({v:1,kind:'ready'})
  `)
  process.env.ERP_TEST_SECRET = 'test-only-sentinel'
  const originalOptions = process.env.NODE_OPTIONS
  process.env.NODE_OPTIONS = '--import=data:text/javascript,process.exit(19)'
  const client = new WorkerClient({ workerUrl: pathToFileURL(file) })
  t.after(async () => {
    delete process.env.ERP_TEST_SECRET
    if (originalOptions === undefined) delete process.env.NODE_OPTIONS
    else process.env.NODE_OPTIONS = originalOptions
    await client.dispose()
  })
  const controller = new AbortController()
  const rejected = assert.rejects(client.health(controller.signal), { code: 'CANCELLED' })
  await delay(200)
  const pid = client.pid
  controller.abort()
  await rejected
  gone(pid)
})
test('missing worker entry settles startup failure and disposal', async () => {
  const client = new WorkerClient({ workerUrl: new URL('./not-present.mjs', import.meta.url) })
  await assert.rejects(client.health(signal()))
  await client.dispose()
})

test('worker exits when its owning host is killed', async t => {
  const source = `import {WorkerClient} from ${JSON.stringify(new URL('../dist/worker-client.js', import.meta.url).href)};
    const client = new WorkerClient();
    const result = await client.health(new AbortController().signal);
    process.stdout.write(String(result.pid));`
  const owner = spawn(process.execPath, ['--input-type=module', '-e', source], { stdio: ['ignore', 'pipe', 'inherit'] })
  t.after(() => owner.kill('SIGKILL'))
  const [chunk] = await once(owner.stdout, 'data')
  const pid = Number(chunk.toString())
  assert.ok(pid > 0)
  const exited = once(owner, 'exit')
  owner.kill('SIGKILL')
  await exited
  for (let i = 0; i < 100; i++) {
    try { process.kill(pid, 0) } catch (error) { assert.equal(error.code, 'ESRCH'); return }
    await delay(10)
  }
  gone(pid)
})
