import { AsyncLocalStorage } from 'node:async_hooks'
import type { Method, Input, Output } from '../storage/contract.js'
import type { Scope } from '../storage/primitives.js'
import type { SessionHint, SiteCatalog } from './catalog.js'

const executions = new AsyncLocalStorage<{ agent?: unknown }>()

export function bindToolExecution<T>(exec: { agent?: unknown }, run: () => T): T {
  return executions.run(exec, run)
}

export function sessionHint(exec?: { agent?: unknown }): SessionHint | undefined {
  const agent = exec ? exec.agent : executions.getStore()?.agent
  if (!agent || typeof agent !== 'object' || !('session' in agent)) return undefined
  const session = (agent as { session?: unknown }).session
  if (!session || typeof session !== 'object') return undefined
  const record = session as { id?: unknown; header?: { id?: unknown; cwd?: unknown } }
  const id = typeof record.id === 'string' ? record.id : typeof record.header?.id === 'string' ? record.header.id : undefined
  const cwd = typeof record.header?.cwd === 'string' ? record.header.cwd : undefined
  if (!id && !cwd) return undefined
  const hint: SessionHint = {}
  if (id) hint.id = id
  if (cwd) hint.cwd = cwd
  return hint
}

function scopeOf(input: unknown): Scope | undefined {
  if (!input || typeof input !== 'object' || !('scope' in input)) return undefined
  const scope = (input as { scope?: unknown }).scope
  if (!scope || typeof scope !== 'object') return undefined
  return scope as Scope
}

/** Sends each tool call to the bound site's database and refuses another site's scope. */
export class RoutedStorage {
  constructor(private readonly catalog: SiteCatalog) {}
  get directory(): string {
    try { return this.catalog.route(sessionHint(), undefined).directory }
    catch { return this.catalog.homeDirectory() }
  }
  call<K extends Method>(method: K, input: Input<K>, signal?: AbortSignal): Promise<Output<K>> {
    const routed = this.catalog.route(sessionHint(), scopeOf(input))
    const invoke = routed.client.call.bind(routed.client) as unknown as (method: K, input: Input<K>, signal?: AbortSignal) => Promise<Output<K>>
    return invoke(method, input, signal)
  }
  dispose(): Promise<void> { return this.catalog.dispose() }
}
