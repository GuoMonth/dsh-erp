import type { StorageClient } from '../storage/client.js'
import type { Input } from '../storage/contract.js'

type Scope = Input<'task'>['scope']
export type Unit = { id: string; level: number; label: string }
type Cursor = { format: 1; units: Unit[]; settled: { id: string; outcome: string; observationIds: string[]; reason: string }[] }
function fail(code: string): never { throw new Error(code) }
export class LearningRuntime {
  constructor(private readonly storage: StorageClient) {}
  async start(scope: Scope, id: string, units: Unit[], signal: AbortSignal) {
    if (!units.length || units.length > 2000 || new Set(units.map(x => x.id)).size !== units.length || units.some(x => !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(x.id) || !Number.isInteger(x.level) || x.level < 1 || x.level > 4 || !x.label.trim() || x.label.length > 500)) fail('INVALID_LEARNING_UNITS')
    const sorted = structuredClone(units).sort((a,b) => a.level-b.level || a.id.localeCompare(b.id))
    return this.storage.call('checkpoint', { scope, id, expectedVersion: 0, state: 'running', frontier: sorted.map(x=>x.id), cursor: { format: 1, units: sorted, settled: [] }, reason: 'breadth-first-round' }, signal)
  }
  async status(scope: Scope, id: string, signal: AbortSignal) {
    const task = await this.storage.call('task', { scope, id }, signal)
    if (!task) return null
    const cursor = task.cursor as unknown as Cursor
    if (cursor?.format !== 1 || !Array.isArray(cursor.units) || !Array.isArray(cursor.settled)) fail('UNKNOWN_LEARNING_CHECKPOINT')
    return { ...task, next: task.state === 'running' ? cursor.units.find(x => x.id === task.frontier[0]) ?? null : null,
      coverage: { discovered: cursor.units.length, pending: task.frontier.length, observed: cursor.settled.filter(x=>x.outcome==='observed').length, blocked: cursor.settled.filter(x=>x.outcome==='blocked').length },
      limitation: 'Counts describe this explicit task set and evidence, not all pages, all permissions or semantic correctness' }
  }
  async finish(scope: Scope, id: string, expectedVersion: number, unitId: string, outcome: 'observed' | 'blocked', observationIds: string[], reason: string, signal: AbortSignal) {
    const task = await this.status(scope, id, signal)
    if (!task || task.state !== 'running' || task.version !== expectedVersion || task.frontier[0] !== unitId) fail('LEARNING_STALE_OR_OUT_OF_ORDER')
    if (!reason.trim() || reason.length > 2000 || observationIds.length > 20 || outcome === 'observed' && !observationIds.length) fail('LEARNING_EVIDENCE_REQUIRED')
    for (const observationId of observationIds) if (!await this.storage.call('observation', { scope, id: observationId }, signal)) fail('LEARNING_SCOPE_OR_EVIDENCE')
    const cursor = structuredClone(task.cursor) as unknown as Cursor
    cursor.settled.push({ id: unitId, outcome, observationIds, reason })
    return this.storage.call('checkpoint', { scope, id, expectedVersion, state: task.frontier.length === 1 ? 'round-ended' : 'running', frontier: task.frontier.slice(1), cursor: cursor as unknown as Input<'checkpoint'>['cursor'], reason }, signal)
  }
  async pause(scope: Scope, id: string, expectedVersion: number, resume: boolean, signal: AbortSignal) {
    const task = await this.status(scope, id, signal)
    if (!task || task.version !== expectedVersion || !task.frontier.length || !['running','paused'].includes(task.state)) fail('LEARNING_STALE_OR_ENDED')
    return this.storage.call('checkpoint', { scope, id, expectedVersion, state: resume ? 'running' : 'paused', frontier: task.frontier, cursor: task.cursor, reason: resume ? 'resumed-no-business-replay' : 'user-paused' }, signal)
  }
  async extend(scope: Scope, id: string, expectedVersion: number, units: Unit[], signal: AbortSignal) {
    const task = await this.status(scope, id, signal)
    if (!task || task.version !== expectedVersion || task.state === 'cancelled') fail('LEARNING_STALE_OR_ENDED')
    const cursor = structuredClone(task.cursor) as unknown as Cursor
    if (!units.length || units.length > 200 || cursor.units.length + units.length > 2000
      || new Set(units.map(x => x.id)).size !== units.length
      || units.some(x => cursor.units.some(y => y.id === x.id) || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(x.id)
        || !Number.isInteger(x.level) || x.level < 1 || x.level > 4 || !x.label.trim() || x.label.length > 500)) fail('INVALID_LEARNING_UNITS')
    cursor.units.push(...structuredClone(units))
    cursor.units.sort((a, b) => a.level - b.level || a.id.localeCompare(b.id))
    const done = new Set(cursor.settled.map(x => x.id))
    return this.storage.call('checkpoint', { scope, id, expectedVersion, state: task.state === 'paused' ? 'paused' : 'running',
      frontier: cursor.units.filter(x => !done.has(x.id)).map(x => x.id), cursor: cursor as unknown as Input<'checkpoint'>['cursor'], reason: 'new-ui-discovery' }, signal)
  }
}
