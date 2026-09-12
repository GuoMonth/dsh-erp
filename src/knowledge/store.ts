import type { DatabaseSync } from 'node:sqlite'
import type { Scope } from '../storage/primitives.js'
import { checkedId, scopeKey, canonicalScope, StorageError } from '../storage/primitives.js'
import type { KnowledgeInput, KnowledgeRecord, KnowledgeView, KnowledgeWrite, Verification } from './contract.js'

type Ref = { id: string; version: number }
const ui = ['menu', 'page', 'tab', 'control', 'window']
const semantic = ['domain', 'object', 'field', 'rule', 'operation']
function fail(code: string): never { throw new StorageError(code) }
function version(value: number, minimum = 1): void {
  if (!Number.isSafeInteger(value) || value < minimum || value >= Number.MAX_SAFE_INTEGER) fail('INVALID_KNOWLEDGE_VERSION')
}
function limit(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > 50) fail('INVALID_KNOWLEDGE_LIMIT')
}
function text(value: string, maximum = 8000): void {
  if (!value.trim() || value.length > maximum) fail('INVALID_KNOWLEDGE_TEXT')
}
function relationAllowed(predicate: string, from: string, to: string): boolean {
  switch (predicate) {
    case 'contains': return (from === 'menu' && ['menu', 'page'].includes(to))
      || (['page', 'tab', 'window'].includes(from) && ['tab', 'control', 'window'].includes(to))
      || (from === 'object' && to === 'field')
    case 'opens': return ['menu', 'control'].includes(from) && ['page', 'tab', 'window'].includes(to)
    case 'belongs-to': return semantic.includes(from) && from !== 'domain' && to === 'domain'
    case 'references': return semantic.includes(from) && semantic.includes(to)
    case 'displays': return ['page', 'tab', 'window'].includes(from) && to === 'object'
    case 'represents': return from === 'control' && to === 'field'
    case 'supports': return ui.includes(from) && from !== 'control' && to === 'domain'
    case 'triggers': return from === 'control' && to === 'operation'
    case 'governed-by': return ['object', 'field', 'operation'].includes(from) && to === 'rule'
    default: return false
  }
}

/** Uses the storage owner's connection. Revisions and their references commit together. */
export class KnowledgeStore {
  constructor(private readonly db: DatabaseSync, private readonly transaction: <T>(action: () => T) => T) {}
  private record(scope: string, id: string, at?: number): KnowledgeRecord | null {
    const row = at === undefined
      ? this.db.prepare('SELECT r.payload FROM knowledge_records n JOIN knowledge_revisions r USING(scope,id,version) WHERE n.scope=? AND n.id=?').get(scope, id)
      : this.db.prepare('SELECT payload FROM knowledge_revisions WHERE scope=? AND id=? AND version=?').get(scope, id, at)
    return row ? JSON.parse(String(row.payload)) as KnowledgeRecord : null
  }
  private view(scope: string, record: KnowledgeRecord): KnowledgeView {
    const staleDependencies = record.dependencies.filter(ref => {
      const current = this.db.prepare('SELECT version,lifecycle FROM knowledge_records WHERE scope=? AND id=?').get(scope, ref.id)
      return !current || current.version !== ref.version || current.lifecycle === 'retired'
    })
    const verifications = this.db.prepare('SELECT payload FROM knowledge_verifications WHERE scope=? AND target_id=? AND target_version=? ORDER BY recorded_at DESC,id DESC LIMIT 11')
      .all(scope, record.id, record.version).map(row => JSON.parse(String(row.payload)) as Verification)
    return { record, staleDependencies, verifications: verifications.slice(0, 10), verificationsTruncated: verifications.length > 10 }
  }
  private evidence(scope: string, refs: KnowledgeRecord['evidence']): void {
    if (refs.length > 50) fail('KNOWLEDGE_EVIDENCE_LIMIT')
    for (const ref of refs) {
      checkedId(ref.observationId); text(ref.quote, 4000)
      const row = this.db.prepare('SELECT payload FROM observations WHERE scope=? AND id=?').get(scope, ref.observationId)
      if (!row) fail('KNOWLEDGE_EVIDENCE_NOT_FOUND')
      const observation = JSON.parse(String(row.payload)) as { title: string; text: string }
      if (!observation.title.includes(ref.quote) && !observation.text.includes(ref.quote)) fail('KNOWLEDGE_QUOTE_NOT_FOUND')
    }
  }
  private prepare(scope: string, input: KnowledgeWrite, origin: 'ai' | 'user', scopeValue: Scope): KnowledgeRecord {
    checkedId(input.id); version(input.expectedVersion, 0); text(input.name, 500); text(input.description)
    if (JSON.stringify(input).length > 64_000 || input.aliases.length > 30 || input.dependencies.length > 50 || input.flags.length > 3) fail('KNOWLEDGE_RECORD_LIMIT')
    for (const alias of input.aliases) text(alias, 500)
    if (new Set(input.aliases).size !== input.aliases.length || new Set(input.flags).size !== input.flags.length) fail('KNOWLEDGE_DUPLICATE_VALUE')
    const previous = this.record(scope, input.id)
    if ((previous?.version ?? 0) !== input.expectedVersion) fail('KNOWLEDGE_VERSION_CONFLICT')
    if (previous && previous.kind !== input.kind) fail('KNOWLEDGE_KIND_IMMUTABLE')
    this.evidence(scope, input.evidence)
    if (input.stage === 'observed' && !input.evidence.length) fail('KNOWLEDGE_OBSERVATION_REQUIRED')
    if (input.kind === 'page' && !input.context?.pageType?.trim()) fail('KNOWLEDGE_PAGE_CONTEXT_REQUIRED')
    if (input.context) {
      for (const value of Object.values(input.context)) text(value, 2000)
      if (input.context.url) {
        let url: URL
        try { url = new URL(input.context.url) } catch { return fail('INVALID_KNOWLEDGE_URL') }
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) fail('INVALID_KNOWLEDGE_URL')
        url.search = ''; url.hash = url.hash.split('?')[0] ?? ''; input.context.url = url.href
      }
    }
    if (input.definition && input.kind !== 'field') fail('KNOWLEDGE_DEFINITION_FIELD_ONLY')
    if (input.definition) {
      if (input.definition.observedValues.length > 100) fail('KNOWLEDGE_VALUE_LIMIT')
      for (const value of input.definition.observedValues) {
        const type = input.definition.valueType
        if ((['string', 'number', 'boolean'].includes(type) && typeof value !== type)
          || (type === 'date' && (typeof value !== 'string' || !Number.isFinite(Date.parse(value))))
          || (type === 'object' && (value === null || typeof value !== 'object' || Array.isArray(value)))) fail('KNOWLEDGE_VALUE_TYPE_MISMATCH')
      }
    }
    const dependencies = new Map<string, Ref>()
    for (const ref of [...input.dependencies, ...(input.from ? [input.from] : []), ...(input.to ? [input.to] : [])]) {
      checkedId(ref.id); version(ref.version)
      if (ref.id === input.id || (dependencies.has(ref.id) && dependencies.get(ref.id)!.version !== ref.version)) fail('KNOWLEDGE_DEPENDENCY_CONFLICT')
      dependencies.set(ref.id, ref)
    }
    if (input.kind === 'relation') {
      if (!input.from || !input.to || !input.predicate) fail('KNOWLEDGE_RELATION_ENDPOINT_REQUIRED')
      if (input.from.id === input.to.id) fail('KNOWLEDGE_RELATION_SELF_LINK')
    } else if (input.from || input.to || input.predicate) fail('KNOWLEDGE_RELATION_FIELDS_ONLY')
    const { expectedVersion, ...fields } = input
    const now = new Date().toISOString()
    return { ...fields, scope: canonicalScope(scopeValue), dependencies: [...dependencies.values()], version: expectedVersion + 1, origin,
      createdAt: previous?.createdAt ?? now, recordedAt: now }
  }
  commit(input: KnowledgeInput<'knowledgeCommit'>): KnowledgeRecord[] {
    const scope = scopeKey(input.scope)
    if (!input.records.length || input.records.length > 50) fail('KNOWLEDGE_BATCH_LIMIT')
    if (new Set(input.records.map(r => r.id)).size !== input.records.length) fail('KNOWLEDGE_DUPLICATE_ID')
    return this.transaction(() => {
      const records = input.records.map(record => this.prepare(scope, structuredClone(record), input.origin, input.scope))
      const staged = new Map(records.map(record => [record.id, record]))
      for (const record of records) {
        const resolve = (ref: Ref) => {
          const candidate = staged.get(ref.id)
          // Retiring stale knowledge preserves its original dependencies, even after an endpoint retires.
          const target = record.lifecycle === 'retired'
            ? (candidate?.version === ref.version ? candidate : this.record(scope, ref.id, ref.version))
            : candidate ?? this.record(scope, ref.id)
          if (!target || target.version !== ref.version || (record.lifecycle === 'active' && target.lifecycle !== 'active')) fail('KNOWLEDGE_DEPENDENCY_NOT_CURRENT')
          return target
        }
        record.dependencies.forEach(resolve)
        if (record.kind === 'relation' && !relationAllowed(record.predicate!, resolve(record.from!).kind, resolve(record.to!).kind)) fail('KNOWLEDGE_RELATION_KIND_MISMATCH')
      }
      for (const record of records) {
        const search = [record.name, ...record.aliases, record.description].join('\n')
        this.db.prepare(`INSERT INTO knowledge_records(scope,id,kind,version,name,search_text,lifecycle,source_id,target_id,predicate) VALUES(?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(scope,id) DO UPDATE SET version=excluded.version,name=excluded.name,search_text=excluded.search_text,lifecycle=excluded.lifecycle,source_id=excluded.source_id,target_id=excluded.target_id,predicate=excluded.predicate`)
          .run(scope, record.id, record.kind, record.version, record.name, search, record.lifecycle, record.from?.id ?? null, record.to?.id ?? null, record.predicate ?? null)
        this.db.prepare('INSERT INTO knowledge_revisions(scope,id,version,payload) VALUES(?,?,?,?)').run(scope, record.id, record.version, JSON.stringify(record))
        this.db.prepare('DELETE FROM knowledge_fts WHERE scope=? AND id=?').run(scope, record.id)
        this.db.prepare('INSERT INTO knowledge_fts(scope,id,text) VALUES(?,?,?)').run(scope, record.id, search)
      }
      // Endpoints may have been created later in this same batch.
      for (const record of records) {
        for (const ref of record.dependencies) this.db.prepare('INSERT INTO knowledge_dependencies(scope,id,version,target_id,target_version) VALUES(?,?,?,?,?)').run(scope, record.id, record.version, ref.id, ref.version)
        for (const ref of record.evidence) this.db.prepare('INSERT INTO knowledge_evidence(scope,id,version,observation_id,quote) VALUES(?,?,?,?,?)').run(scope, record.id, record.version, ref.observationId, ref.quote)
      }
      const cycle = this.db.prepare(`WITH RECURSIVE paths(start,node) AS (
        SELECT source_id,target_id FROM knowledge_records WHERE scope=? AND predicate='contains' AND lifecycle='active'
        UNION SELECT p.start,n.target_id FROM paths p JOIN knowledge_records n ON n.source_id=p.node WHERE n.scope=? AND n.predicate='contains' AND n.lifecycle='active'
      ) SELECT 1 FROM paths WHERE start=node LIMIT 1`).get(scope, scope)
      if (cycle) fail('KNOWLEDGE_CONTAINMENT_CYCLE')
      return records
    })
  }
  get(input: KnowledgeInput<'knowledgeGet'>): KnowledgeView | null {
    const scope = scopeKey(input.scope); checkedId(input.id)
    if (input.version !== undefined) version(input.version)
    const record = this.record(scope, input.id, input.version)
    return record ? this.view(scope, record) : null
  }
  private page(scope: string, rows: { id: unknown }[], size: number) {
    const selected = rows.slice(0, size)
    return { items: selected.map(row => this.view(scope, this.record(scope, String(row.id))!)),
      hasMore: rows.length > size, nextAfter: selected.length ? String(selected.at(-1)!.id) : '' }
  }
  search(input: KnowledgeInput<'knowledgeSearch'>) {
    limit(input.limit); if (input.query !== '') text(input.query, 500)
    if (input.after) checkedId(input.after)
    const scope = scopeKey(input.scope)
    const params = [scope, input.after, input.kind ?? '', input.kind ?? '']
    const rows = [...input.query].length >= 3
      ? this.db.prepare(`SELECT n.id FROM knowledge_fts f JOIN knowledge_records n ON n.scope=f.scope AND n.id=f.id
          WHERE n.scope=? AND n.id>? AND (?='' OR n.kind=?) AND knowledge_fts MATCH ? ORDER BY n.id LIMIT ?`)
        .all(...params, `"${input.query.replaceAll('"', '""')}"`, input.limit + 1)
      : this.db.prepare(`SELECT id FROM knowledge_records WHERE scope=? AND id>? AND (?='' OR kind=?) AND instr(lower(search_text),lower(?))>0 ORDER BY id LIMIT ?`)
        .all(...params, input.query, input.limit + 1)
    return this.page(scope, rows as { id: unknown }[], input.limit)
  }
  neighbors(input: KnowledgeInput<'knowledgeNeighbors'>) {
    limit(input.limit); checkedId(input.id); if (input.after) checkedId(input.after)
    const scope = scopeKey(input.scope)
    const rows = this.db.prepare(`SELECT id FROM knowledge_records WHERE scope=? AND id>? AND kind='relation' AND lifecycle='active'
      AND (?='' OR predicate=?) AND ((? IN ('out','both') AND source_id=?) OR (? IN ('in','both') AND target_id=?)) ORDER BY id LIMIT ?`)
      .all(scope, input.after, input.predicate ?? '', input.predicate ?? '', input.direction, input.id, input.direction, input.id, input.limit + 1)
    return this.page(scope, rows as { id: unknown }[], input.limit)
  }
  history(input: KnowledgeInput<'knowledgeHistory'>) {
    const scope = scopeKey(input.scope); checkedId(input.id); version(input.afterVersion, 0); limit(input.limit)
    const rows = this.db.prepare('SELECT payload FROM knowledge_revisions WHERE scope=? AND id=? AND version>? ORDER BY version LIMIT ?')
      .all(scope, input.id, input.afterVersion, input.limit + 1)
    const items = rows.slice(0, input.limit).map(row => this.view(scope, JSON.parse(String(row.payload)) as KnowledgeRecord))
    return { items, hasMore: rows.length > input.limit, nextVersion: items.at(-1)?.record.version ?? input.afterVersion }
  }
  verifications(input: KnowledgeInput<'knowledgeVerifications'>) {
    const scope = scopeKey(input.scope); checkedId(input.id); version(input.version); limit(input.limit)
    if (input.after) checkedId(input.after)
    const rows = this.db.prepare('SELECT payload FROM knowledge_verifications WHERE scope=? AND target_id=? AND target_version=? AND id>? ORDER BY id LIMIT ?')
      .all(scope, input.id, input.version, input.after, input.limit + 1)
    const items = rows.slice(0, input.limit).map(row => JSON.parse(String(row.payload)) as Verification)
    return { items, hasMore: rows.length > input.limit, nextAfter: items.at(-1)?.id ?? '' }
  }
  verify(input: KnowledgeInput<'knowledgeVerify'>): Verification {
    const scope = scopeKey(input.scope); checkedId(input.id); checkedId(input.target.id); version(input.target.version)
    text(input.proposition); text(input.conditions); text(input.method)
    if (JSON.stringify(input).length > 32_000) fail('KNOWLEDGE_VERIFICATION_LIMIT')
    return this.transaction(() => {
      const target = this.record(scope, input.target.id)
      if (!target || target.version !== input.target.version || target.lifecycle !== 'active') fail('KNOWLEDGE_VERIFICATION_TARGET_CHANGED')
      this.evidence(scope, input.evidence)
      if (this.db.prepare('SELECT 1 FROM knowledge_verifications WHERE scope=? AND id=?').get(scope, input.id)) fail('KNOWLEDGE_VERIFICATION_ID_CONFLICT')
      const value: Verification = { ...input, scope: canonicalScope(input.scope), origin: 'user-confirmation', recordedAt: new Date().toISOString() }
      this.db.prepare('INSERT INTO knowledge_verifications(scope,id,target_id,target_version,recorded_at,payload) VALUES(?,?,?,?,?,?)')
        .run(scope, value.id, value.target.id, value.target.version, value.recordedAt, JSON.stringify(value))
      for (const ref of value.evidence) this.db.prepare('INSERT INTO knowledge_verification_evidence(scope,verification_id,observation_id,quote) VALUES(?,?,?,?)').run(scope, value.id, ref.observationId, ref.quote)
      return value
    })
  }
}
