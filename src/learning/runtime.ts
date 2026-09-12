import { createHash } from 'node:crypto'
import type { StorageClient } from '../storage/client.js'
import type { Input } from '../storage/contract.js'
import type { KnowledgeWrite } from '../knowledge/contract.js'

type Scope = Input<'task'>['scope']
export type Unit = { id: string; level: number; label: string }
type Cursor = { format: 1; units: Unit[]; settled: { id: string; outcome: string; observationIds: string[]; reason: string }[] }
function fail(code: string): never { throw new Error(code) }
const key = (text: string) => createHash('sha256').update(text).digest('hex').slice(0,24)
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
  async importMenu(scope: Scope, observationId: string, signal: AbortSignal) {
    const observation = await this.storage.call('observation', { scope, id: observationId }, signal)
    if (!observation || JSON.parse(observation.context).source !== 'scm-usa-read-v1' || JSON.parse(observation.context).query !== 'menu') fail('MENU_OBSERVATION_REQUIRED')
    const rows = JSON.parse(observation.text)
    const nodes: { id: string; name: string; url: string; parent: string; level: number; quote: string }[] = []
    const seen = new Set<string>()
    const visit = (list: unknown, parent = '', level = 1) => {
      if (!Array.isArray(list) || level > 8) fail('INVALID_MENU_TREE')
      for (const row of list) {
        if (!row || typeof row.id !== 'string' || seen.has(row.id) || typeof row.name !== 'string' || typeof row.url !== 'string' || nodes.length >= 2000) fail('INVALID_MENU_TREE')
        seen.add(row.id)
        const id = 'scm-menu-' + key(row.id)
        const url = row.url && /^\/?[a-zA-Z0-9_/-]+$/.test(row.url) ? new URL('/#/' + row.url.replace(/^\//,''), observation.url).href : ''
        nodes.push({ id, name: row.name || `[untranslated ${row.id}]`, quote: row.name || row.id, url, parent, level })
        visit(row.children, id, level + 1)
      }
    }
    visit(rows)
    const versions = new Map<string,number>()
    const put = async (record: Omit<KnowledgeWrite,'expectedVersion'>) => {
      const current = await this.storage.call('knowledgeGet', { scope, id: record.id }, signal)
      if (current?.record.origin === 'user') return current.record.version
      // A retry against the same source observation does not create another version.
      if (current && current.record.evidence.some(x=>x.observationId===observationId) && JSON.stringify(current.record.dependencies) === JSON.stringify([...record.dependencies, ...(record.from ? [record.from] : []), ...(record.to ? [record.to] : [])])) return current.record.version
      const [saved] = await this.storage.call('knowledgeCommit', { scope, origin: 'ai', records: [{ ...record, expectedVersion: current?.record.version ?? 0 }] }, signal)
      return saved!.version
    }
    // Retire obsolete adapter-owned topology before introducing a moved branch. User corrections stay authoritative.
    const desiredEdges = new Set(nodes.filter(x=>x.parent).map(x=>'scm-edge-'+key(x.parent+':'+x.id)))
    for (const [kind, query, prefix, desired] of [
      ['relation', 'Menu hierarchy from source response', 'scm-edge-', desiredEdges],
      ['menu', 'Discovered in the current account menu response', 'scm-menu-', new Set(nodes.map(x=>x.id))],
    ] as const) {
      let after = ''
      do {
        const page = await this.storage.call('knowledgeSearch', { scope, kind, query, after, limit: 50 }, signal)
        for (const {record} of page.items) if (record.id.startsWith(prefix) && record.origin === 'ai' && record.lifecycle === 'active' && !desired.has(record.id)) {
          const { scope: _scope, version, origin: _origin, createdAt: _created, recordedAt: _recorded, ...fields } = record
          await this.storage.call('knowledgeCommit', { scope, origin: 'ai', records: [{ ...fields, lifecycle: 'retired', expectedVersion: version }] }, signal)
        }
        after = page.hasMore ? page.nextAfter : ''
      } while (after)
    }
    for (const node of nodes) versions.set(node.id, await put({ id: node.id, kind: 'menu', name: node.name, aliases: [], description: 'Discovered in the current account menu response; rendered page and business behavior remain unverified.', stage: 'discovered', flags: node.name.startsWith('[untranslated') ? ['needs-review'] : [], lifecycle: 'active', evidence: [{ observationId, quote: node.quote }], dependencies: [], context: { ...(node.url ? { url: node.url } : {}), detail: `scm-usa-read-v1 menu level ${node.level}` } }))
    for (const node of nodes.filter(x=>x.parent)) await put({ id: 'scm-edge-' + key(node.parent+':'+node.id), kind: 'relation', name: 'contains', aliases: [], description: 'Menu hierarchy from source response', stage: 'discovered', flags: [], lifecycle: 'active', evidence: [{ observationId, quote: node.quote }], dependencies: [], from: { id: node.parent, version: versions.get(node.parent)! }, to: { id: node.id, version: versions.get(node.id)! }, predicate: 'contains' })
    return { scope, observationId, nodes: nodes.length, roots: nodes.filter(x=>!x.parent).length, unnamed: nodes.filter(x=>x.name.startsWith('[untranslated')).length,
      rootEntries: nodes.filter(x=>!x.parent).map(({id,name})=>({id,name})),
      entryPoints: nodes.filter(x=>['/usa-pms/product','/usa-inv/stock','/usa-pur/order','/usa-sale/order'].some(path=>x.url.endsWith('#'+path))).map(({id,name,url})=>({id,name,url})),
      menuIds: nodes.map(x=>x.id), limitation: 'Discovered menu metadata only. Rendered-page coverage and business-domain interpretation are separate. Previous snapshots are retained; removed adapter-owned nodes/edges retire, dependent domain knowledge needs review. User corrections are preserved.' }
  }
}
