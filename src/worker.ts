import { setTimeout as delay } from 'node:timers/promises'
import { assertRuntime } from './runtime-version.js'
import { parseRequest, PROTOCOL } from './protocol.js'
import type { Response } from './protocol.js'

assertRuntime()
if (!process.send) throw new Error('ERP worker must be started by its host over IPC')
let active: { id: string; controller: AbortController } | undefined

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
  if (request.id.length > 128 || request.delayMs < 0 || request.delayMs > 30_000) {
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
      await delay(request.delayMs, undefined, { signal: controller.signal })
      send({ v: PROTOCOL, kind: 'result', id: request.id,
        value: { pid: process.pid, node: process.versions.node, protocol: PROTOCOL } })
    } catch {
      send({ v: PROTOCOL, kind: 'error', id: request.id,
        code: controller.signal.aborted ? 'CANCELLED' : 'WORKER_ERROR' })
    } finally { active = undefined }
  })()
})

// IPC ownership, not a persisted PID, controls the worker's lifetime.
process.on('disconnect', () => { active?.controller.abort(); process.exit(0) })
process.on('SIGTERM', () => { active?.controller.abort(); process.exit(0) })
send({ v: PROTOCOL, kind: 'ready' })
