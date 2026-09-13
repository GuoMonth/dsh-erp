import { setTimeout as delay } from 'node:timers/promises'
import { assertRuntime } from './runtime-version.js'
import { parseRequest, PROTOCOL } from './protocol.js'
import type { Response } from './protocol.js'
import { BrowserSession } from './browser/session.js'
import { BrowserError } from './browser/contract.js'

assertRuntime()
if (!process.send) throw new Error('ERP worker must be started by its host over IPC')
let active: { id: string; controller: AbortController } | undefined
const browser = process.env.ERP_BROWSER_DIRECTORY ? new BrowserSession({
  directory: process.env.ERP_BROWSER_DIRECTORY, headless: process.env.ERP_BROWSER_HEADLESS === 'true',
  sandbox: process.env.ERP_BROWSER_SANDBOX !== 'false',
  ...(process.env.ERP_BROWSER_READ_POLICY ? { readPolicyFile: process.env.ERP_BROWSER_READ_POLICY } : {}),
  progress: (phase, percent) => send({ v: PROTOCOL, kind: 'progress', phase, percent }),
}) : undefined

function send(message: Response): void {
  if (process.connected) process.send!(message, error => { if (error) process.exit(1) })
}

process.on('message', (raw: unknown) => {
  let request
  try { request = parseRequest(raw) } catch { process.exit(1) }
  if (request.kind === 'cancel') {
    if (active?.id === request.id) active.controller.abort()
    return
  }
  if (request.id.length > 128 || request.kind === 'request' && (request.delayMs < 0 || request.delayMs > 30_000)) {
    send({ v: PROTOCOL, kind: 'error', id: request.id, code: 'INVALID_REQUEST' })
    return
  }
  if (active) {
    send({ v: PROTOCOL, kind: 'error', id: request.id, code: 'BUSY' })
    return
  }
  const controller = new AbortController()
  active = { id: request.id, controller }
  void (async () => {
    try {
      if (request.kind === 'browser') {
        if (!browser) throw new BrowserError('BROWSER_NOT_CONFIGURED')
        let value
        switch (request.method) {
          case 'browser.snapshot': value = await browser.snapshot(controller.signal); break
          case 'browser.action': value = await browser.action(request.input, controller.signal); break
          case 'browser.connect': value = await browser.connect(request.input, controller.signal); break
          case 'browser.open': value = await browser.open(request.input, controller.signal); break
          case 'browser.status': value = browser.status(); break
          case 'browser.resume': value = await browser.resume(request.input.sessionId, request.input.revision, controller.signal); break
          case 'browser.pause': value = browser.pause(); break
          case 'browser.capture': value = await browser.capture(controller.signal); break
          case 'browser.readPolicy': value = browser.readPolicy(); break
          case 'browser.readEnable': value = await browser.enableRead(request.input, controller.signal); break
          case 'browser.read': value = await browser.read(request.input, controller.signal); break
          case 'browser.close': value = await browser.close(); break
        }
        controller.signal.throwIfAborted()
        send({ v: PROTOCOL, kind: 'result', id: request.id, value })
        return
      }
      await delay(request.delayMs, undefined, { signal: controller.signal })
      send({ v: PROTOCOL, kind: 'result', id: request.id,
        value: { pid: process.pid, node: process.versions.node, protocol: PROTOCOL } })
    } catch (error) {
      if (request.kind === 'browser') browser?.pause(controller.signal.aborted ? 'cancelled' : 'operation-failed')
      send({ v: PROTOCOL, kind: 'error', id: request.id,
        code: controller.signal.aborted ? 'CANCELLED' : error instanceof BrowserError ? error.code : 'WORKER_ERROR' })
    } finally { active = undefined }
  })()
})

// IPC ownership, not a persisted PID, controls the worker's lifetime.
const shutdown = () => { active?.controller.abort(); void browser?.close().finally(() => process.exit(0)); if (!browser) process.exit(0) }
process.on('disconnect', shutdown)
process.on('SIGTERM', shutdown)
send({ v: PROTOCOL, kind: 'ready' })
