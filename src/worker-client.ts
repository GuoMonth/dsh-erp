import { fork } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { parseResponse, parseRequest, validateBrowser, PROTOCOL } from './protocol.js'
import type { Health, Request, BrowserMethod, BrowserInput, BrowserOutput } from './protocol.js'

export class WorkerError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'WorkerError' }
}
export interface RuntimeEvent {
  kind: 'worker-started' | 'worker-exited' | 'request-finished'
  requestId?: string
  elapsedMs?: number
  code?: string
}
type Pending = { id: string; finish(error?: Error, value?: unknown): void }

/** A bounded, single-operation channel. Restarting never replays an operation. */
export class WorkerClient {
  private child: ChildProcess | undefined
  private pending: Pending | undefined
  private starting: Promise<void> | undefined
  private stopped: Promise<void> = Promise.resolve()
  private stopResolve: (() => void) | undefined
  private rejectStartup: ((error: Error) => void) | undefined
  private closed = false
  private stopping = false
  private busy = false
  private disposePromise: Promise<void> | undefined
  private resourceProgress = { phase: 'preparing', percent: 0 }

  constructor(private readonly options: {
    workerUrl?: URL
    timeoutMs?: number
    onEvent?: (event: RuntimeEvent) => void
    browserDirectory?: string
    browserHeadless?: boolean
    browserResourcesDir?: string
    browserSandbox?: boolean
  } = {}) {}

  get pid(): number | undefined { return this.child?.pid }
  get browserProgress(): { phase: string; percent: number } { return { ...this.resourceProgress } }

  private emit(event: RuntimeEvent): void {
    try { this.options.onEvent?.(event) } catch { /* Diagnostics cannot break cleanup. */ }
  }

  private async start(): Promise<void> {
    if (this.closed) throw new WorkerError('WORKER_CLOSED')
    if (this.stopping) await this.stopped
    if (this.closed) throw new WorkerError('WORKER_CLOSED')
    if (this.starting) return this.starting
    if (this.child) return
    // Explicit allowlist: do not inherit provider keys, NODE_OPTIONS or preload hooks.
    const env: NodeJS.ProcessEnv = {}
    for (const key of ['PATH', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL', 'DISPLAY', 'XAUTHORITY', 'WAYLAND_DISPLAY', 'XDG_RUNTIME_DIR', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'NODE_EXTRA_CA_CERTS']) {
      if (process.env[key] !== undefined) env[key] = process.env[key]
    }
    if (this.options.browserDirectory) {
      env.ERP_BROWSER_DIRECTORY = this.options.browserDirectory
      env.PLAYWRIGHT_BROWSERS_PATH = this.options.browserResourcesDir ?? this.options.browserDirectory + '/browser-resources'
      env.ERP_BROWSER_HEADLESS = String(this.options.browserHeadless === true)
      env.ERP_BROWSER_SANDBOX = String(this.options.browserSandbox !== false)
    }
    const child = fork(this.options.workerUrl ?? new URL('./worker.js', import.meta.url), [], {
      env, execArgv: [], stdio: ['ignore', 'ignore', 'ignore', 'ipc'], serialization: 'json',
    })
    this.child = child
    this.stopped = new Promise(resolve => { this.stopResolve = resolve })
    this.starting = new Promise<void>((resolve, reject) => {
      this.rejectStartup = reject
      let ready = false
      const timer = setTimeout(() => { void this.terminate(new WorkerError('WORKER_START_TIMEOUT')) }, 10_000)
      child.once('close', () => clearTimeout(timer))
      child.on('message', (raw: unknown) => {
        if (this.child !== child || this.stopping) return
        let message
        try { message = parseResponse(raw) } catch {
          void this.terminate(new WorkerError('INVALID_PROTOCOL_MESSAGE')); return
        }
        if (message.kind === 'ready') {
          if (ready) { void this.terminate(new WorkerError('UNEXPECTED_WORKER_RESPONSE')); return }
          ready = true
          clearTimeout(timer)
          this.rejectStartup = undefined
          resolve()
          this.emit({ kind: 'worker-started' })
        } else if (message.kind === 'progress') {
          if (!ready || !this.pending || message.percent < 0 || message.percent > 100) { void this.terminate(new WorkerError('INVALID_PROTOCOL_MESSAGE')); return }
          this.resourceProgress = { phase: message.phase, percent: message.percent }
        } else if (ready && this.pending?.id === message.id) {
          if (message.kind === 'error') this.pending.finish(new WorkerError(message.code))
          else this.pending.finish(undefined, message.value)
        } else {
          void this.terminate(new WorkerError('UNEXPECTED_WORKER_RESPONSE'))
        }
      })
      child.once('error', () => { void this.terminate(new WorkerError('WORKER_START_FAILED')) })
      child.once('close', () => {
        if (this.child !== child) return
        this.child = undefined
        this.stopping = false
        this.rejectStartup?.(new WorkerError('WORKER_EXITED'))
        this.rejectStartup = undefined
        this.pending?.finish(new WorkerError('WORKER_EXITED'))
        this.stopResolve?.()
        this.stopResolve = undefined
        this.emit({ kind: 'worker-exited' })
      })
    })
    try { await this.starting } finally { this.starting = undefined }
  }

  private send(message: Request): void {
    if (!this.child?.connected) throw new WorkerError('WORKER_DISCONNECTED')
    this.child.send(message, error => {
      if (error) void this.terminate(new WorkerError('WORKER_DISCONNECTED'))
    })
  }

  async health(signal: AbortSignal, delayMs = 0): Promise<Health> {
    const value = await this.request({ kind: 'request', method: 'health', delayMs }, signal)
    if (!value || typeof value !== 'object' || !('pid' in value)) throw new WorkerError('INVALID_PROTOCOL_MESSAGE')
    return value as Health
  }

  async browser<K extends BrowserMethod>(method: K, input: BrowserInput<K>, signal: AbortSignal): Promise<BrowserOutput<K>> {
    validateBrowser(method, 'input', input)
    const snapshot = structuredClone(input)
    const value = await this.request({ kind: 'browser', method, input: snapshot }, signal, method === 'browser.open' ? 660_000 : 15_000)
    validateBrowser(method, 'output', value)
    return value as BrowserOutput<K>
  }

  private async request(payload: { kind: 'request'; method: 'health'; delayMs: number } | { kind: 'browser'; method: BrowserMethod; input: unknown }, signal: AbortSignal, timeoutMs = this.options.timeoutMs ?? 10_000): Promise<unknown> {
    if (this.closed) throw new WorkerError('WORKER_CLOSED')
    signal.throwIfAborted()
    if (this.busy) throw new WorkerError('WORKER_BUSY')
    this.busy = true
    // Cancelling startup also tears down the process before returning.
    const abortStart = () => { void this.terminate(new WorkerError('CANCELLED')) }
    signal.addEventListener('abort', abortStart, { once: true })
    try {
      await this.start()
      signal.removeEventListener('abort', abortStart)
      signal.throwIfAborted()
      if (this.closed) throw new WorkerError('WORKER_CLOSED')
      return await new Promise<unknown>((resolve, reject) => {
        const id = randomUUID()
        const started = performance.now()
        let cancelTimer: ReturnType<typeof setTimeout> | undefined
        let abortCode: string | undefined
        const cancel = (code: string) => {
          if (abortCode) return
          abortCode = code
          try { this.send({ v: PROTOCOL, kind: 'cancel', id }) } catch { /* Kill below. */ }
          cancelTimer = setTimeout(() => { void this.terminate(new WorkerError(code)) }, payload.kind === 'browser' ? 3000 : 300)
        }
        const onAbort = () => cancel('CANCELLED')
        const timer = setTimeout(() => cancel('WORKER_TIMEOUT'), timeoutMs)
        this.pending = { id, finish: (error, value) => {
          clearTimeout(timer)
          clearTimeout(cancelTimer)
          signal.removeEventListener('abort', onAbort)
          this.pending = undefined
          const failure = abortCode ? new WorkerError(abortCode) : error
          this.emit({ kind: 'request-finished', requestId: id, elapsedMs: Math.round(performance.now() - started), code: failure?.message ?? 'OK' })
          if (failure) reject(failure)
          else if (value) resolve(value)
          else reject(new WorkerError('MISSING_RESULT'))
        } }
        signal.addEventListener('abort', onAbort, { once: true })
        try {
          this.send(parseRequest({ v: PROTOCOL, id, ...payload }))
          if (signal.aborted) onAbort()
        } catch (error) { void this.terminate(error instanceof Error ? error : new WorkerError('WORKER_ERROR')) }
      })
    } finally {
      signal.removeEventListener('abort', abortStart)
      this.busy = false
    }
  }

  private async terminate(error: Error): Promise<void> {
    const child = this.child
    if (!child) return
    this.stopping = true
    // Pending callers settle only once the owned process has exited.
    const onExit = () => {
      this.rejectStartup?.(error)
      this.pending?.finish(error)
    }
    child.prependOnceListener('close', onExit)
    child.kill('SIGTERM')
    const force = setTimeout(() => child.kill('SIGKILL'), this.options.browserDirectory ? 5000 : 500)
    try { await this.stopped } finally { clearTimeout(force) }
  }

  dispose(): Promise<void> {
    this.closed = true
    return this.disposePromise ??= this.terminate(new WorkerError('WORKER_CLOSED'))
  }
}
