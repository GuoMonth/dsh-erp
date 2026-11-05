import type { Snapshot } from '../browser/snapshot.js'
import type { KnowledgeWrite } from '../knowledge/contract.js'
import type { StorageClient } from '../storage/client.js'
import type { Input, Output } from '../storage/contract.js'
import type { Scope } from '../storage/primitives.js'
import { controlKey, importSnapshot, isMenuControl, parseSnapshot } from './snapshot-import.js'

type ScopeInput = Input<'task'>['scope']
const MAX_UNITS = 2000
const MAX_DISCOVER = 200
type Level = 1 | 2 | 3
type InternalUnit = {
  id: string
  level: Level
  mode: 'snapshot' | 'open-page'
  label: string
  targetName: string
  targetHref: string
  boundObservationId: string
  discoveredFromUrl: string
  discoveredObservationId: string
}
type Settled = { id: string; outcome: 'observed' | 'blocked'; observationIds: string[]; reason: string }
type Cursor = {
  format: 2
  depth: 3
  level: Level
  units: InternalUnit[]
  settled: Settled[]
  parked: InternalUnit[]
  summaries: { level: number; id: string; version: number }[]
  dropped: number
}
export type ExplorationUnit = {
  id: string
  level: Level
  mode: 'snapshot' | 'open-page'
  label: string
  targetName: string
  targetHref: string
  boundObservationId: string
  requiresApproval: boolean
}
export type ExplorationView = {
  id: string
  scope: Scope
  version: number
  state: Output<'checkpoint'>['state']
  reason: string
  frontier: string[]
  next: ExplorationUnit | null
  coverage: { depth: 3; level: Level; discovered: number; pending: number; observed: number; blocked: number }
  summaries: Cursor['summaries']
  limitation: string
}
const limitation = 'Counts describe this controller-owned round, not every page, permission or business meaning. Depth stops at 3.'
function fail(code: string): never { throw new Error(code) }
function httpUrl(value: string): URL | null {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch { return null }
}
function learningSource(context: string): boolean {
  try { return JSON.parse(context).source === 'browser-learning-v1' } catch { return false }
}
function readCursor(value: unknown): Cursor {
  if (!value || typeof value !== 'object') fail('UNKNOWN_LEARNING_CHECKPOINT')
  const cursor = value as Cursor
  if (cursor.format !== 2 || cursor.depth !== 3 || ![1, 2, 3].includes(cursor.level)) fail('UNKNOWN_LEARNING_CHECKPOINT')
  return cursor
}
function quoteFor(text: string): string {
  try {
    const snapshot = JSON.parse(text) as { title?: string; url?: string }
    const candidate = snapshot.title || snapshot.url
    if (typeof candidate === 'string' && candidate && text.includes(JSON.stringify(candidate))) return JSON.stringify(candidate)
  } catch { /* Native or legacy text still has to contain its own quote. */ }
  const clip = text.trim().slice(0, 80)
  if (clip && text.includes(clip)) return clip
  fail('LEARNING_SUMMARY_QUOTE')
}
function leafKinds(level: Level): string[] {
  if (level === 1) return ['menu', 'page']
  if (level === 2) return ['page', 'control', 'relation']
  return ['field', 'tab', 'window']
}

/** Owns the frontier. Callers submit observations; they do not submit units. */
export class LearningRuntime {
  constructor(private readonly storage: StorageClient) {}
  async begin(scope: ScopeInput, id: string, signal: AbortSignal, expectedVersion = 0): Promise<ExplorationView> {
    const entry: InternalUnit = { id: 'L1-entry', level: 1, mode: 'snapshot', label: 'Entry snapshot', targetName: '', targetHref: '',
      boundObservationId: '', discoveredFromUrl: '', discoveredObservationId: '' }
    const cursor: Cursor = { format: 2, depth: 3, level: 1, units: [entry], settled: [], parked: [], summaries: [], dropped: 0 }
    const task = await this.storage.call('checkpoint', { scope, id, expectedVersion, state: 'running', frontier: [entry.id],
      cursor, reason: expectedVersion > 0 ? 'explore-replaced' : 'bfs-depth-3' }, signal)
    return this.view(task)
  }
  async status(scope: ScopeInput, id: string, signal: AbortSignal): Promise<ExplorationView | null> {
    const task = await this.storage.call('task', { scope, id }, signal)
    return task ? this.view(task) : null
  }
  async accept(scope: ScopeInput, id: string, expectedVersion: number, observationId: string, signal: AbortSignal): Promise<ExplorationView> {
    const task = await this.running(scope, id, expectedVersion, signal)
    const cursor = readCursor(task.cursor)
    const head = cursor.units.find(unit => unit.id === task.frontier[0])
    if (!head) fail('LEARNING_STALE_OR_OUT_OF_ORDER')
    const observation = await this.storage.call('observation', { scope, id: observationId }, signal)
    if (!observation || !learningSource(observation.context)) fail('UI_OBSERVATION_REQUIRED')
    const snapshot = parseSnapshot(observation.text)
    if (!this.matches(head, snapshot, observationId)) fail('LEARNING_OBSERVATION_MISMATCH')
    await importSnapshot(this.storage, scope, observationId, signal)
    this.park(cursor, this.discover(snapshot, head.level, observationId))
    return this.settle(scope, id, expectedVersion, task, cursor, head, 'observed', [observationId], 'Snapshot accepted by the controller', signal)
  }
  async block(scope: ScopeInput, id: string, expectedVersion: number, reason: string, signal: AbortSignal): Promise<ExplorationView> {
    if (!reason.trim() || reason.length > 2000) fail('LEARNING_EVIDENCE_REQUIRED')
    const task = await this.running(scope, id, expectedVersion, signal)
    const cursor = readCursor(task.cursor)
    const head = cursor.units.find(unit => unit.id === task.frontier[0])
    if (!head) fail('LEARNING_STALE_OR_OUT_OF_ORDER')
    return this.settle(scope, id, expectedVersion, task, cursor, head, 'blocked', [], reason, signal)
  }
  async pause(scope: ScopeInput, id: string, expectedVersion: number, resume: boolean, signal: AbortSignal): Promise<ExplorationView> {
    const task = await this.storage.call('task', { scope, id }, signal)
    if (!task || task.version !== expectedVersion || !task.frontier.length || !['running', 'paused'].includes(task.state)) fail('LEARNING_STALE_OR_ENDED')
    readCursor(task.cursor)
    const saved = await this.storage.call('checkpoint', { scope, id, expectedVersion, state: resume ? 'running' : 'paused',
      frontier: task.frontier, cursor: task.cursor, reason: resume ? 'resumed-no-business-replay' : 'user-paused' }, signal)
    return this.view(saved)
  }
  private async running(scope: ScopeInput, id: string, expectedVersion: number, signal: AbortSignal): Promise<Output<'checkpoint'>> {
    const task = await this.storage.call('task', { scope, id }, signal)
    if (!task || task.state !== 'running' || task.version !== expectedVersion || task.frontier.length === 0) fail('LEARNING_STALE_OR_OUT_OF_ORDER')
    readCursor(task.cursor)
    return task
  }
  private matches(unit: InternalUnit, snapshot: Snapshot, observationId: string): boolean {
    if (unit.mode === 'snapshot') {
      if (!unit.boundObservationId) return true
      if (observationId === unit.boundObservationId) return true
      const bound = httpUrl(unit.discoveredFromUrl)
      const page = httpUrl(snapshot.url)
      return Boolean(bound && page && bound.origin === page.origin && bound.pathname === page.pathname
        && snapshot.controls.some(control => control.name === unit.targetName))
    }
    if (observationId && observationId === unit.discoveredObservationId) return false
    const href = httpUrl(unit.targetHref)
    const page = httpUrl(snapshot.url)
    if (href) return Boolean(page && page.origin === href.origin && page.pathname === href.pathname)
    const from = httpUrl(unit.discoveredFromUrl)
    const moved = Boolean(page && from && page.origin === from.origin && page.pathname !== from.pathname)
    const named = snapshot.title.includes(unit.targetName) || snapshot.controls.some(control => control.name === unit.targetName)
      || snapshot.frames.some(frame => frame.text.includes(unit.targetName))
    return moved || named
  }
  private discover(snapshot: Snapshot, level: Level, observationId: string): InternalUnit[] {
    if (level >= 3) return []
    const next = (level + 1) as Level
    const found: InternalUnit[] = []
    for (const control of snapshot.controls) {
      if (!control.name) continue
      const menu = isMenuControl(control)
      if (next === 2 && !menu) continue
      if (next === 3 && (menu || !['field', 'tab', 'window'].includes(control.kind))) continue
      const mode = next === 2 ? 'open-page' : 'snapshot'
      found.push({
        id: `L${next}-${controlKey(snapshot.url, control)}`, level: next, mode,
        label: control.name.slice(0, 500), targetName: control.name.slice(0, 500), targetHref: control.href || '',
        boundObservationId: mode === 'snapshot' ? observationId : '',
        discoveredFromUrl: snapshot.url, discoveredObservationId: observationId,
      })
    }
    return found
  }
  private park(cursor: Cursor, found: InternalUnit[]): void {
    const known = new Set([...cursor.units, ...cursor.parked].map(unit => unit.id))
    let added = 0
    for (const unit of found) {
      if (known.has(unit.id)) continue
      if (added >= MAX_DISCOVER || cursor.units.length + cursor.parked.length >= MAX_UNITS) { cursor.dropped++; continue }
      known.add(unit.id)
      cursor.parked.push(unit)
      added++
    }
  }
  private async settle(scope: ScopeInput, id: string, expectedVersion: number, task: Output<'checkpoint'>, cursor: Cursor, head: InternalUnit,
    outcome: Settled['outcome'], observationIds: string[], reason: string, signal: AbortSignal): Promise<ExplorationView> {
    cursor.settled.push({ id: head.id, outcome, observationIds, reason })
    let frontier = task.frontier.slice(1)
    let summary: Input<'learningAdvance'>['summary']
    if (frontier.length === 0) {
      const sealed = await this.summary(scope, id, cursor, head.level, signal)
      summary = sealed.summary
      cursor.summaries.push({ level: head.level, id: sealed.summary.record.id, version: sealed.summary.record.expectedVersion + 1 })
      if (head.level < 3 && cursor.parked.length) {
        const promoted = [...cursor.parked].sort((a, b) => a.id.localeCompare(b.id))
        cursor.parked = []
        cursor.level = (head.level + 1) as Level
        cursor.units.push(...promoted)
        frontier = promoted.map(unit => unit.id)
      } else {
        cursor.parked = []
        frontier = []
      }
    }
    const saved = await this.storage.call('learningAdvance', {
      scope, id, expectedVersion, state: frontier.length ? 'running' : 'round-ended', frontier,
      cursor, reason, ...(summary ? { summary } : {}),
    }, signal)
    return this.view(saved.checkpoint)
  }
  private async summary(scope: ScopeInput, roundId: string, cursor: Cursor, level: Level, signal: AbortSignal) {
    const levelUnits = cursor.units.filter(unit => unit.level === level)
    const settled = cursor.settled.filter(item => levelUnits.some(unit => unit.id === item.id))
    const observed = [...new Set(settled.filter(item => item.outcome === 'observed').flatMap(item => item.observationIds))].slice(0, 20)
    const blocked = settled.filter(item => item.outcome === 'blocked').length
    const labels = levelUnits.map(unit => unit.label).filter(Boolean).slice(0, 12).map(label => label.slice(0, 80))
    const description = [
      `Level ${level} of 3.`,
      `Observed ${settled.length - blocked}, blocked ${blocked}.`,
      labels.length ? `Items: ${labels.join(', ')}.` : 'No items.',
      cursor.dropped ? 'Some visible items were not queued because the round is capped.' : '',
      'Compact index summary. Not complete ERP coverage.',
    ].filter(Boolean).join(' ').slice(0, 1500)
    const evidence = []
    for (const observationId of observed) {
      const observation = await this.storage.call('observation', { scope, id: observationId }, signal)
      if (!observation) fail('LEARNING_SCOPE_OR_EVIDENCE')
      evidence.push({ observationId, quote: quoteFor(observation.text) })
    }
    const summaryId = `summary-${roundId}-L${level}`
    const previous = await this.storage.call('knowledgeGet', { scope, id: summaryId }, signal)
    const parent = cursor.summaries.find(item => item.level === level - 1)
    const record: KnowledgeWrite = {
      id: summaryId, kind: 'summary', name: `Level ${level} summary`, aliases: [], description,
      expectedVersion: previous?.record.version ?? 0, stage: evidence.length ? 'observed' : 'discovered',
      flags: blocked ? ['blocked', 'needs-review'] : ['needs-review'], lifecycle: 'active', evidence,
      dependencies: parent ? [{ id: parent.id, version: parent.version }] : [],
      context: { detail: 'internal-node' },
    }
    return { summary: { record, level, ...(parent ? { parentId: parent.id } : {}), observationIds: observed, leafKinds: leafKinds(level) } }
  }
  private view(task: Output<'checkpoint'>): ExplorationView {
    const cursor = readCursor(task.cursor)
    const next = task.state === 'running' || task.state === 'paused' ? cursor.units.find(unit => unit.id === task.frontier[0]) ?? null : null
    return {
      id: task.id, scope: task.scope, version: task.version, state: task.state, reason: task.reason, frontier: task.frontier,
      next: next ? { id: next.id, level: next.level, mode: next.mode, label: next.label, targetName: next.targetName,
        targetHref: next.targetHref, boundObservationId: next.boundObservationId, requiresApproval: next.mode === 'open-page' } : null,
      coverage: { depth: 3, level: cursor.level, discovered: cursor.units.length, pending: task.frontier.length,
        observed: cursor.settled.filter(item => item.outcome === 'observed').length,
        blocked: cursor.settled.filter(item => item.outcome === 'blocked').length },
      summaries: cursor.summaries, limitation,
    }
  }
}
