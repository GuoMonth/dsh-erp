import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { open, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { isAbsolute, join } from 'node:path'
import { normalizeBookmark } from '../product/bookmark.js'
import { rejectSecrets } from '../sites/catalog.js'
import type { StorageClient } from '../storage/client.js'
import { privateDirectory } from '../storage/paths.js'
import type { Scope } from '../storage/primitives.js'
import { StorageError } from '../storage/primitives.js'
import { kinds } from './contract.js'
import type { KnowledgeView, KnowledgeWrite } from './contract.js'
import { unzipArchive, zipArchive } from './zip.js'

const require = createRequire(import.meta.url)
const producerVersion = (require('../../package.json') as { version: string }).version
const FORMAT = 'dsh-erp-share-pack'
const RECORD_FORMAT = 'dsh-erp-share-record'
const SCHEMA = 1
const MAX_BYTES = 16_000_000
const APP = '@guosheng_047/dsh-erp'
const KNOWN = new Set<string>(kinds)
const PREDICATES = new Set(['contains', 'opens', 'belongs-to', 'references', 'displays', 'represents', 'supports', 'triggers', 'governed-by'])
const VALUE_TYPES = new Set(['unknown', 'string', 'number', 'boolean', 'date', 'object'])

export interface ShareSite { entryUrl: string; name: string; workspaceId: string }
export interface ShareWarning { line: number; kind: string; warning: string }
export interface ShareImport { imported: number; skipped: ShareWarning[]; warnings: string[]; scope: Scope }
export interface ShareExport { path: string; bytes: Buffer; records: number; fileName: string }

function fail(code: string): never { throw new StorageError(code) }
function acceptsSchema(value: unknown): boolean {
  return value === SCHEMA || (SCHEMA > 1 && value === SCHEMA - 1)
}
function textOf(value: unknown, limit: number): string | undefined {
  return typeof value === 'string' && value.trim() && value.length <= limit ? value : undefined
}
function recordId(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value) ? value : undefined
}
function refOf(value: unknown): { id: string; version: 1 } | undefined {
  if (!value || typeof value !== 'object') return undefined
  const id = recordId((value as { id?: unknown }).id)
  return id ? { id, version: 1 } : undefined
}
function warningText(item: ShareWarning): string {
  return `line ${item.line}: skipped ${item.kind} (${item.warning})`
}

async function selected(storage: StorageClient, scope: Scope, signal: AbortSignal): Promise<KnowledgeView[]> {
  const items: KnowledgeView[] = []
  let after = ''
  do {
    const page = await storage.call('knowledgeSearch', { scope, query: '', after, limit: 50 }, signal)
    items.push(...page.items.filter(item => item.record.lifecycle === 'active' && item.record.kind !== 'summary'))
    if (items.length > 2000) fail('SHARE_PACK_LIMIT')
    after = page.hasMore ? page.nextAfter : ''
  } while (after)
  let kept = items.filter(item => !item.staleDependencies.length)
  for (;;) {
    const versions = new Map(kept.map(item => [item.record.id, item.record.version]))
    const next = kept.filter(({ record }) => record.dependencies.every(ref => versions.get(ref.id) === ref.version))
    if (next.length === kept.length) return next
    kept = next
  }
}

function siteOf(site: ShareSite): ShareSite {
  const bookmark = normalizeBookmark(site.entryUrl)
  const workspaceId = textOf(site.workspaceId, 200)
  if (!workspaceId) fail('SHARE_PACK_FORMAT')
  return { entryUrl: bookmark.entryUrl, name: (site.name || new URL(bookmark.entryUrl).hostname).slice(0, 200), workspaceId }
}

/** Primary share pack. Login, cookies, evidence and field samples stay out of the zip. */
export async function exportSharePack(storage: StorageClient, scope: Scope, site: ShareSite, signal: AbortSignal): Promise<ShareExport> {
  signal.throwIfAborted()
  const records = await selected(storage, scope, signal)
  const ids = new Map(records.map((item, index) => [item.record.id, `item-${String(index + 1).padStart(4, '0')}`]))
  const ref = (id: string) => ({ id: ids.get(id)!, version: 1 as const })
  const lines = records.map(({ record }) => JSON.stringify({
    format: RECORD_FORMAT, schemaVersion: SCHEMA, kind: record.kind, version: 1, id: ids.get(record.id),
    name: record.name, aliases: record.aliases, description: record.description,
    dependencies: record.dependencies.map(item => ref(item.id)),
    ...(record.context?.pageType ? { pageType: record.context.pageType } : {}),
    ...(record.kind === 'relation' && record.predicate ? { predicate: record.predicate } : {}),
    ...(record.kind === 'relation' && record.from ? { from: ref(record.from.id) } : {}),
    ...(record.kind === 'relation' && record.to ? { to: ref(record.to.id) } : {}),
    ...(record.definition ? { valueType: record.definition.valueType } : {}),
  }))
  const jsonl = Buffer.from(lines.length ? `${lines.join('\n')}\n` : '', 'utf8')
  const digest = createHash('sha256').update(jsonl).digest('hex')
  const manifest = {
    format: FORMAT, schemaVersion: SCHEMA, producer: { app: APP, version: producerVersion },
    site: siteOf(site), inventory: [{ path: 'knowledge.jsonl', sha256: digest, records: records.length }],
    integrity: { algorithm: 'sha256' },
  }
  const bytes = zipArchive([
    { name: 'manifest.json', data: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`) },
    { name: 'knowledge.jsonl', data: jsonl },
  ])
  const directory = privateDirectory(join(storage.directory, 'exports'))
  const path = join(directory, `erp-share-${digest.slice(0, 16)}-${randomUUID()}.zip`)
  await writeFile(path, bytes, { mode: 0o600, flag: 'wx' })
  return { path, bytes, records: records.length, fileName: 'erp-share-pack.zip' }
}

interface ParsedRecord {
  line: number
  id: string
  kind: KnowledgeWrite['kind']
  name: string
  aliases: string[]
  description: string
  dependencies: { id: string; version: 1 }[]
  pageType?: string
  predicate?: KnowledgeWrite['predicate']
  from?: { id: string; version: 1 }
  to?: { id: string; version: 1 }
  valueType?: 'unknown' | 'string' | 'number' | 'boolean' | 'date' | 'object'
}

function parseLine(line: string, lineNo: number, warnings: ShareWarning[]): ParsedRecord | undefined {
  let value: unknown
  try { value = JSON.parse(line) } catch { fail('SHARE_PACK_FORMAT') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('SHARE_PACK_FORMAT')
  rejectSecrets(value)
  const row = value as Record<string, unknown>
  if (row.format !== RECORD_FORMAT) fail('SHARE_PACK_FORMAT')
  if (!acceptsSchema(row.schemaVersion)) fail('SHARE_PACK_VERSION')
  if (typeof row.kind !== 'string') fail('SHARE_PACK_FORMAT')
  if (!KNOWN.has(row.kind)) { warnings.push({ line: lineNo, kind: row.kind, warning: 'unknown-kind' }); return undefined }
  if (row.version !== undefined && (typeof row.version !== 'number' || !Number.isInteger(row.version) || row.version < 1)) {
    warnings.push({ line: lineNo, kind: row.kind, warning: 'invalid-record' })
    return undefined
  }
  const id = recordId(row.id)
  const name = textOf(row.name, 500)
  if (!id || !name) { warnings.push({ line: lineNo, kind: row.kind, warning: 'invalid-record' }); return undefined }
  if (row.aliases !== undefined && (!Array.isArray(row.aliases) || row.aliases.some(item => typeof item !== 'string'))) {
    warnings.push({ line: lineNo, kind: row.kind, warning: 'invalid-record' })
    return undefined
  }
  const aliases = Array.isArray(row.aliases) ? row.aliases.slice(0, 20).map(item => item.slice(0, 200)) : []
  const description = typeof row.description === 'string' ? row.description.slice(0, 4000) : ''
  const dependencies = Array.isArray(row.dependencies) ? row.dependencies.map(refOf) : []
  if (dependencies.some(item => !item)) { warnings.push({ line: lineNo, kind: row.kind, warning: 'invalid-record' }); return undefined }
  const parsed: ParsedRecord = { line: lineNo, id, kind: row.kind as ParsedRecord['kind'], name, aliases, description, dependencies: dependencies.filter((item): item is { id: string; version: 1 } => Boolean(item)) }
  if (typeof row.pageType === 'string' && row.pageType.length <= 200) parsed.pageType = row.pageType
  if (row.kind === 'relation') {
    const from = refOf(row.from)
    const to = refOf(row.to)
    const predicate = typeof row.predicate === 'string' && PREDICATES.has(row.predicate) ? row.predicate as ParsedRecord['predicate'] : undefined
    if (!from || !to || !predicate) { warnings.push({ line: lineNo, kind: row.kind, warning: 'invalid-record' }); return undefined }
    parsed.from = from
    parsed.to = to
    parsed.predicate = predicate
  }
  if (row.valueType !== undefined) {
    if (typeof row.valueType !== 'string' || !VALUE_TYPES.has(row.valueType)) {
      warnings.push({ line: lineNo, kind: row.kind, warning: 'invalid-record' })
      return undefined
    }
    parsed.valueType = row.valueType as 'unknown' | 'string' | 'number' | 'boolean' | 'date' | 'object'
  }
  return parsed
}

/** Import a local zip. Records are reinterpreted into the receiver scope and never executed. */
export async function importSharePack(storage: StorageClient, scope: Scope, bytes: Buffer, signal: AbortSignal): Promise<ShareImport> {
  signal.throwIfAborted()
  if (!bytes.length || bytes.length > MAX_BYTES) fail('SHARE_PACK_LIMIT')
  const files = unzipArchive(bytes)
  const manifestBytes = files.get('manifest.json')
  const jsonl = files.get('knowledge.jsonl')
  if (!manifestBytes || !jsonl) fail('SHARE_PACK_INVENTORY')
  let manifest: Record<string, unknown>
  try { manifest = JSON.parse(manifestBytes.toString('utf8')) as Record<string, unknown> } catch { fail('SHARE_PACK_FORMAT') }
  rejectSecrets(manifest)
  if (manifest.format !== FORMAT) fail('SHARE_PACK_FORMAT')
  if (!acceptsSchema(manifest.schemaVersion)) fail('SHARE_PACK_VERSION')
  const inventory = Array.isArray(manifest.inventory) ? manifest.inventory : []
  const listed = inventory.find(item => item && typeof item === 'object' && (item as { path?: unknown }).path === 'knowledge.jsonl') as { sha256?: unknown } | undefined
  if (!listed || listed.sha256 !== createHash('sha256').update(jsonl).digest('hex')) fail('SHARE_PACK_INTEGRITY')
  const site = manifest.site
  if (site && typeof site === 'object' && typeof (site as { entryUrl?: unknown }).entryUrl === 'string') {
    const entry = (site as { entryUrl: string }).entryUrl
    if (entry) {
      let url: URL
      try { url = new URL(entry) } catch { fail('SHARE_PACK_FORMAT') }
      if (url.username || url.password) fail('ERP_PASSWORD_REJECTED')
    }
  }
  const warnings: ShareWarning[] = []
  const parsed: ParsedRecord[] = []
  const seen = new Set<string>()
  const lines = jsonl.toString('utf8').replace(/^\uFEFF/, '').split(/\r?\n/)
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!
    if (!line.trim()) continue
    const record = parseLine(line, index + 1, warnings)
    if (!record) continue
    if (seen.has(record.id)) { warnings.push({ line: record.line, kind: record.kind, warning: 'duplicate-id' }); continue }
    seen.add(record.id)
    parsed.push(record)
  }
  let rows = parsed
  for (;;) {
    const ids = new Set(rows.map(row => row.id))
    const next = rows.filter(row => row.dependencies.every(ref => ids.has(ref.id)) && (!row.from || ids.has(row.from.id)) && (!row.to || ids.has(row.to.id)))
    if (next.length === rows.length) break
    for (const row of rows) if (!next.includes(row)) warnings.push({ line: row.line, kind: row.kind, warning: 'dangling-reference' })
    rows = next
  }
  if (!rows.length) return { imported: 0, skipped: warnings, warnings: warnings.map(warningText), scope }
  const records: KnowledgeWrite[] = rows.map(row => ({
    id: row.id, kind: row.kind, name: row.name, aliases: row.aliases, description: row.description,
    expectedVersion: 0, stage: 'interpreted', flags: ['needs-review'], lifecycle: 'active', evidence: [],
    dependencies: row.dependencies,
    ...(row.pageType ? { context: { pageType: row.pageType } } : {}),
    ...(row.valueType ? { definition: { valueType: row.valueType, observedValues: [], completeness: 'unknown' as const } } : {}),
    ...(row.from ? { from: row.from } : {}),
    ...(row.to ? { to: row.to } : {}),
    ...(row.predicate ? { predicate: row.predicate } : {}),
  }))
  const bundleId = createHash('sha256').update(JSON.stringify(records)).digest('hex')
  const saved = await storage.call('knowledgeImport', { scope, bundleId, records }, signal)
  return { imported: saved.length, skipped: warnings, warnings: warnings.map(warningText), scope }
}

export async function readShareFile(path: string, signal: AbortSignal): Promise<Buffer> {
  signal.throwIfAborted()
  if (!isAbsolute(path)) fail('SHARE_PACK_ABSOLUTE_PATH')
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const stat = await file.stat()
    if (!stat.isFile() || stat.size > MAX_BYTES) fail('SHARE_PACK_LIMIT')
    const buffer = Buffer.alloc(stat.size)
    let size = 0
    while (size < buffer.length) {
      signal.throwIfAborted()
      const read = await file.read(buffer, size, buffer.length - size, null)
      if (!read.bytesRead) break
      size += read.bytesRead
    }
    if (size !== stat.size) fail('SHARE_PACK_LIMIT')
    return buffer
  } finally { await file.close() }
}
