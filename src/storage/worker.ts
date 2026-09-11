import { parentPort, workerData } from 'node:worker_threads'
import { StoreDatabase } from './database.js'
import { contracts, StorageError } from './contract.js'
import type { Method } from './contract.js'
import { assertRuntime } from '../runtime-version.js'

assertRuntime()
if (!parentPort || !workerData || typeof workerData.directory !== 'string') throw new Error('STORAGE_WORKER_CONFIGURATION')
const port = parentPort
const codeOf = (error: unknown) => error instanceof StorageError ? error.code : 'STORAGE_OPERATION_FAILED'
let store: StoreDatabase
try {
  store = new StoreDatabase(workerData.directory)
  if (!workerData.restoreOnly) await store.open()
  port.postMessage({ v: 1, kind: 'ready' })
} catch (error) {
  port.postMessage({ v: 1, kind: 'failed', code: codeOf(error) })
  port.close()
}
let queue = Promise.resolve()
port.on('message', (request: unknown) => {
  queue = queue.then(async () => {
    if (!request || typeof request !== 'object' || !('v' in request) || request.v !== 1 || !('id' in request) || typeof request.id !== 'string') {
      throw new StorageError('INVALID_STORAGE_MESSAGE')
    }
    const message = request as { v: 1; id: string; method: string; input: never }
    if (message.method === 'close') { store.close(); port.close(); return }
    try {
      if (!Object.hasOwn(contracts, message.method)) throw new StorageError('INVALID_STORAGE_METHOD')
      if (workerData.restoreOnly && message.method !== 'restore') throw new StorageError('STORAGE_RESTORE_ONLY')
      const value = await store.execute(message.method as Method, message.input)
      port.postMessage({ v: 1, kind: 'result', id: message.id, value })
    } catch (error) { port.postMessage({ v: 1, kind: 'error', id: message.id, code: codeOf(error) }) }
  }).catch(() => { store.close(); port.close() })
})
