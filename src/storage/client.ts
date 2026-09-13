import { Worker } from 'node:worker_threads'
import { StorageError, validate } from './contract.js'
import type { Input, Method, Output } from './contract.js'
import { defaultDataDir } from './paths.js'
import { scopeKey } from './primitives.js'
import type { Scope } from './primitives.js'

/** Serial durable work, independent of the cancellable browser process. */
export class StorageClient {
  readonly directory: string
  private thread: Worker | undefined
  private ready: Promise<void> | undefined
  private tail: Promise<unknown> = Promise.resolve()
  private exited: Promise<void> = Promise.resolve()
  private pending: { id: string; method: Method; resolve(value: unknown): void; reject(error: Error): void } | undefined
  private failure: StorageError | undefined
  private closed = false
  private closing: Promise<void> | undefined
  private sequence = 0
  private admitted = 0

  constructor(private readonly options: { directory?: string; restoreOnly?: boolean; scope?: Scope } = {}) {
    this.directory = options.directory ?? defaultDataDir()
  }
  private start(): Promise<void> {
    if (this.failure) return Promise.reject(this.failure)
    return this.ready ??= new Promise<void>((resolve, reject) => {
      const thread = new Worker(new URL('./worker.js', import.meta.url), {
        workerData: { directory: this.directory, restoreOnly: this.options.restoreOnly === true },
        env: {}, execArgv: [],
      })
      this.thread = thread
      let ready = false
      const fail = (code: string) => {
        this.failure ??= new StorageError(code)
        reject(this.failure)
        this.pending?.reject(this.failure)
        this.pending = undefined
      }
      const timer = setTimeout(() => { fail('STORAGE_START_TIMEOUT'); void thread.terminate() }, 30_000)
      this.exited = new Promise(done => thread.once('exit', () => {
        clearTimeout(timer)
        if (!this.closed || this.pending || !ready) fail('STORAGE_WORKER_EXITED')
        done()
      }))
      thread.on('error', () => fail('STORAGE_WORKER_FAILED'))
      thread.on('message', (raw: unknown) => {
        try {
          if (!raw || typeof raw !== 'object' || !('v' in raw) || raw.v !== 1 || !('kind' in raw)) throw new StorageError('INVALID_STORAGE_MESSAGE')
          const message = raw as { kind: string; id?: string; code?: string; value?: unknown }
          if (message.kind === 'ready' && !ready) { ready = true; clearTimeout(timer); resolve(); return }
          if (message.kind === 'failed' && !ready && typeof message.code === 'string') { fail(message.code); return }
          const pending = this.pending
          if (!pending || pending.id !== message.id) throw new StorageError('INVALID_STORAGE_MESSAGE')
          if (message.kind === 'error' && typeof message.code === 'string') pending.reject(new StorageError(message.code))
          else if (message.kind === 'result') { validate(pending.method, 'output', message.value); pending.resolve(message.value) }
          else throw new StorageError('INVALID_STORAGE_MESSAGE')
          this.pending = undefined
        } catch { fail('INVALID_STORAGE_MESSAGE'); void thread.terminate() }
      })
    })
  }
  call<K extends Method>(method: K, input: Input<K>, signal?: AbortSignal): Promise<Output<K>> {
    if (this.closed) return Promise.reject(new StorageError('STORAGE_CLOSED'))
    if (this.admitted >= 16) return Promise.reject(new StorageError('STORAGE_QUEUE_FULL'))
    let snapshot: Input<K>
    try {
      validate(method, 'input', input)
      if (this.options.scope && 'scope' in input && scopeKey(input.scope as Scope) !== scopeKey(this.options.scope)) {
        throw new StorageError('ERP_SCOPE_MISMATCH: use the exact scope from erp_system_status')
      }
      if (JSON.stringify(input).length > 16_000_000) throw new StorageError('STORAGE_PAYLOAD_TOO_LARGE')
      snapshot = structuredClone(input as unknown) as Input<K>
    } catch (error) { return Promise.reject(error) }
    this.admitted++
    const task: Promise<unknown> = this.tail.then(async (): Promise<unknown> => {
      signal?.throwIfAborted()
      await this.start()
      signal?.throwIfAborted()
      if (this.failure) throw this.failure
      // Once dispatched, settle the actual durable outcome. Never kill/retry a commit on caller cancellation.
      return await new Promise<unknown>((resolve, reject) => {
        const id = String(++this.sequence)
        this.pending = { id, method, resolve, reject }
        try { this.thread!.postMessage({ v: 1, id, method, input: snapshot }) }
        catch { this.pending = undefined; reject(new StorageError('STORAGE_DISCONNECTED')) }
      })
    }).finally(() => { this.admitted-- })
    this.tail = task.catch(() => {})
    return task as Promise<Output<K>>
  }
  dispose(): Promise<void> {
    if (this.closing) return this.closing
    this.closed = true
    return this.closing = (async () => {
      await this.tail
      if (this.thread && !this.failure) this.thread.postMessage({ v: 1, id: String(++this.sequence), method: 'close' })
      await this.exited
    })()
  }
}

/** Offline restore can run even when the original store cannot open. Never overwrites a destination. */
export async function restoreBackup(directory: string, backupId: string, destination: string): Promise<void> {
  const client = new StorageClient({ directory, restoreOnly: true })
  try { await client.call('restore', { backupId, destination }) }
  finally { await client.dispose() }
}
