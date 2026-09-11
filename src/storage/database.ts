import { DatabaseSync, backup as sqliteBackup } from 'node:sqlite'
import { createHash, randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'
import {
  chmodSync, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync,
  openSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync,
} from 'node:fs'
import { StorageError, canonicalScope, scopeKey, validate } from './contract.js'
import type { Input, Method, Output } from './contract.js'
import { privateDirectory } from './paths.js'

export const SCHEMA_VERSION = 2
const HASH = /^[a-f0-9]{64}$/
const ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/
const sha = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex')
export const migrations = [
  `CREATE TABLE observations(id TEXT PRIMARY KEY, scope TEXT NOT NULL, payload TEXT NOT NULL, fingerprint TEXT NOT NULL, evidence_hash TEXT REFERENCES evidence(hash)) STRICT;
   CREATE INDEX observations_scope ON observations(scope);
   CREATE TABLE evidence(hash TEXT PRIMARY KEY, bytes INTEGER NOT NULL) STRICT;
   CREATE TABLE tasks(id TEXT NOT NULL, scope TEXT NOT NULL, version INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(id,scope)) STRICT;`,
  `CREATE VIRTUAL TABLE observations_fts USING fts5(id UNINDEXED, title, text, tokenize='trigram');
   INSERT INTO observations_fts(id,title,text) SELECT id,json_extract(payload,'$.title'),json_extract(payload,'$.text') FROM observations;`,
]
function checkedId(id: string): string {
  if (!ID.test(id)) throw new StorageError('INVALID_RECORD_ID')
  return id
}
function durableWrite(path: string, data: Uint8Array | string): void {
  const fd = openSync(path, 'wx', 0o600)
  try { writeFileSync(fd, data); fsyncSync(fd) } finally { closeSync(fd) }
}
function syncDirectory(path: string): void {
  if (process.platform === 'win32') return
  const fd = openSync(path, 'r')
  try { fsyncSync(fd) } finally { closeSync(fd) }
}
function plainFile(path: string): Uint8Array {
  if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw new StorageError('INVALID_EVIDENCE_FILE')
  return readFileSync(path)
}
function normalizeUrl(raw: string): string {
  let url: URL
  try { url = new URL(raw) } catch { throw new StorageError('INVALID_OBSERVATION_URL') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new StorageError('INVALID_OBSERVATION_URL')
  url.search = ''
  url.hash = url.hash.split('?')[0] ?? ''
  return url.href
}

/** Owned only by the storage worker. No browser/model/user wait occurs in a transaction. */
export class StoreDatabase {
  private db!: DatabaseSync
  readonly directory: string
  constructor(directory: string, private readonly migrationSql = migrations) {
    this.directory = privateDirectory(directory)
  }
  async open(): Promise<void> {
    const path = join(this.directory, 'store.sqlite')
    if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new StorageError('DATABASE_SYMLINK')
    try {
      this.db = new DatabaseSync(path, { timeout: 250, enableForeignKeyConstraints: true })
      // SQLite's retained connection lock avoids PID files and stale-lock recovery races.
      this.db.exec('PRAGMA locking_mode=EXCLUSIVE; BEGIN EXCLUSIVE; COMMIT;')
      const version = Number(this.db.prepare('PRAGMA user_version').get()!.user_version)
      if (version > SCHEMA_VERSION) throw new StorageError('DATABASE_VERSION_TOO_NEW')
      if (version === 0 && this.db.prepare("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all().length) {
        throw new StorageError('UNRECOGNIZED_DATABASE')
      }
      if (version > 0 && version < SCHEMA_VERSION) await this.makeBackup()
      this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;')
      if (version < SCHEMA_VERSION) {
        try {
          this.transaction(() => {
            for (let v = version; v < SCHEMA_VERSION; v++) {
              const sql = this.migrationSql[v]
              if (!sql) throw new StorageError('MIGRATION_MISSING')
              this.db.exec(sql)
              this.db.exec(`PRAGMA user_version=${v + 1}`)
            }
            if (!this.databaseOk()) throw new StorageError('MIGRATION_VALIDATION_FAILED')
          })
        } catch { throw new StorageError('MIGRATION_FAILED_ORIGINAL_RETAINED') }
      }
      privateDirectory(join(this.directory, 'evidence'))
      chmodSync(path, 0o600)
      this.transaction(() => {
        for (const row of this.db.prepare('SELECT id,scope,payload FROM tasks').all()) {
          const task = JSON.parse(String(row.payload)) as Output<'checkpoint'>
          if (task.state !== 'running') continue
          task.state = 'paused'; task.reason = 'storage-restarted'; task.version++
          this.db.prepare('UPDATE tasks SET version=?,payload=? WHERE id=? AND scope=?')
            .run(task.version, JSON.stringify(task), String(row.id), String(row.scope))
        }
      })
    } catch (error) {
      this.close()
      if (error instanceof StorageError) throw error
      if (typeof error === 'object' && error && 'errcode' in error && error.errcode === 5) throw new StorageError('STORAGE_ALREADY_OPEN')
      throw new StorageError('STORAGE_OPEN_FAILED')
    }
  }
  close(): void { if (this.db?.isOpen) this.db.close() }
  private transaction<T>(action: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try { const result = action(); this.db.exec('COMMIT'); return result }
    catch (error) { if (this.db.isTransaction) this.db.exec('ROLLBACK'); throw error }
  }
  private databaseOk(db = this.db): boolean {
    return db.prepare('PRAGMA quick_check').all().every(r => r.quick_check === 'ok') && db.prepare('PRAGMA foreign_key_check').all().length === 0
  }
  private evidencePath(hash: string, directory = this.directory): string {
    if (!HASH.test(hash)) throw new StorageError('INVALID_EVIDENCE_HASH')
    return join(directory, 'evidence', hash)
  }
  private writeEvidence(input: NonNullable<Input<'observe'>['evidence']>): string {
    if (input.base64.length > 12_000_000 || input.base64.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.base64)) throw new StorageError('INVALID_EVIDENCE')
    const bytes = Buffer.from(input.base64, 'base64')
    if (bytes.toString('base64') !== input.base64) throw new StorageError('INVALID_EVIDENCE')
    const hash = sha(bytes)
    const path = this.evidencePath(hash)
    if (existsSync(path)) {
      if (sha(plainFile(path)) !== hash) throw new StorageError('EVIDENCE_CORRUPT')
      return hash
    }
    const temporary = `${path}.${randomUUID()}.tmp`
    try { durableWrite(temporary, bytes); renameSync(temporary, path); syncDirectory(join(this.directory, 'evidence')) }
    finally { if (existsSync(temporary)) rmSync(temporary) }
    return hash
  }
  private observe(input: Input<'observe'>): Output<'observe'> {
    checkedId(input.id)
    const scope = scopeKey(input.scope)
    if (!Number.isFinite(Date.parse(input.observedAt)) || input.text.length > 1_000_000 || input.title.length > 2000 || input.context.length > 8000) throw new StorageError('INVALID_OBSERVATION')
    const url = normalizeUrl(input.url)
    const hash = input.evidence ? this.writeEvidence(input.evidence) : undefined
    const value: Output<'observe'> = {
      id: input.id, scope: canonicalScope(input.scope), url, title: input.title, text: input.text,
      locale: input.locale, context: input.context, observedAt: input.observedAt, version: 1,
      ...(hash ? { evidenceHash: hash, evidenceMime: input.evidence!.mime } : {}),
    }
    const payload = JSON.stringify(value)
    const fingerprint = sha(payload)
    const previous = this.db.prepare('SELECT scope,fingerprint,payload FROM observations WHERE id=?').get(input.id)
    if (previous) {
      if (previous.scope !== scope || previous.fingerprint !== fingerprint) throw new StorageError('OBSERVATION_ID_CONFLICT')
      return JSON.parse(String(previous.payload)) as Output<'observe'>
    }
    return this.transaction(() => {
      if (hash) this.db.prepare('INSERT OR IGNORE INTO evidence(hash,bytes) VALUES(?,?)').run(hash, Buffer.from(input.evidence!.base64, 'base64').byteLength)
      this.db.prepare('INSERT INTO observations(id,scope,payload,fingerprint,evidence_hash) VALUES(?,?,?,?,?)').run(input.id, scope, payload, fingerprint, hash ?? null)
      this.db.prepare('INSERT INTO observations_fts(id,title,text) VALUES(?,?,?)').run(input.id, input.title, input.text)
      return value
    })
  }
  private getObservation(input: Input<'observation'>): Output<'observation'> {
    const row = this.db.prepare('SELECT payload FROM observations WHERE scope=? AND id=?').get(scopeKey(input.scope), checkedId(input.id))
    return row ? JSON.parse(String(row.payload)) as Output<'observe'> : null
  }
  private checkpoint(input: Input<'checkpoint'>): Output<'checkpoint'> {
    checkedId(input.id)
    if (input.frontier.length > 10_000 || JSON.stringify(input.cursor).length > 1_000_000 || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0 || input.expectedVersion >= Number.MAX_SAFE_INTEGER) throw new StorageError('INVALID_CHECKPOINT')
    const scope = scopeKey(input.scope)
    return this.transaction(() => {
      const previous = this.db.prepare('SELECT version FROM tasks WHERE scope=? AND id=?').get(scope, input.id)
      if (Number(previous?.version ?? 0) !== input.expectedVersion) throw new StorageError('CHECKPOINT_CONFLICT')
      const value: Output<'checkpoint'> = { id: input.id, scope: canonicalScope(input.scope), version: input.expectedVersion + 1,
        state: input.state, frontier: input.frontier, cursor: input.cursor, reason: input.reason }
      this.db.prepare('INSERT INTO tasks(id,scope,version,payload) VALUES(?,?,?,?) ON CONFLICT(id,scope) DO UPDATE SET version=excluded.version,payload=excluded.payload')
        .run(input.id, scope, value.version, JSON.stringify(value))
      return value
    })
  }
  private search(input: Input<'search'>): Output<'search'> {
    if (!input.query.trim() || input.query.length > 500 || input.limit < 1 || input.limit > 100) throw new StorageError('INVALID_SEARCH')
    const scope = scopeKey(input.scope)
    const rows = [...input.query].length >= 3
      ? this.db.prepare('SELECT o.payload FROM observations_fts f JOIN observations o ON o.id=f.id WHERE observations_fts MATCH ? AND o.scope=? ORDER BY o.id LIMIT ?').all(`"${input.query.replaceAll('"', '""')}"`, scope, input.limit)
      : this.db.prepare("SELECT payload FROM observations WHERE scope=? AND instr(lower(json_extract(payload,'$.title') || ' ' || json_extract(payload,'$.text')),lower(?))>0 ORDER BY id LIMIT ?").all(scope, input.query, input.limit)
    return rows.map(row => JSON.parse(String(row.payload)) as Output<'observe'>)
  }
  private check(): Output<'check'> {
    const result: Output<'check'> = { databaseOk: this.databaseOk(), missing: [], corrupt: [], orphaned: [] }
    const referenced = new Set(this.db.prepare('SELECT hash FROM evidence').all().map(r => String(r.hash)))
    for (const hash of referenced) {
      const path = this.evidencePath(hash)
      if (!existsSync(path)) result.missing.push(hash)
      else {
        try { if (sha(plainFile(path)) !== hash) result.corrupt.push(hash) }
        catch { result.corrupt.push(hash) }
      }
    }
    for (const name of readdirSync(join(this.directory, 'evidence'))) if (!referenced.has(name)) result.orphaned.push(name)
    return result
  }
  private async makeBackup(): Promise<Output<'backup'>> {
    const backups = privateDirectory(join(this.directory, 'backups'))
    const id = randomUUID()
    const stage = privateDirectory(join(backups, `.pending-${id}`))
    try {
      const dbPath = join(stage, 'store.sqlite')
      await sqliteBackup(this.db, dbPath)
      chmodSync(dbPath, 0o600)
      const snapshot = new DatabaseSync(dbPath)
      let hashes: string[]; let schemaVersion: number
      try {
        // Snapshot becomes a standalone main file before hashing/copying.
        snapshot.exec('PRAGMA journal_mode=DELETE')
        if (!this.databaseOk(snapshot)) throw new StorageError('BACKUP_DATABASE_INVALID')
        schemaVersion = Number(snapshot.prepare('PRAGMA user_version').get()!.user_version)
        hashes = snapshot.prepare('SELECT hash FROM evidence').all().map(r => String(r.hash))
      } finally { snapshot.close() }
      privateDirectory(join(stage, 'evidence'))
      for (const hash of hashes) {
        const bytes = plainFile(this.evidencePath(hash))
        if (sha(bytes) !== hash) throw new StorageError('BACKUP_EVIDENCE_INVALID')
        durableWrite(this.evidencePath(hash, stage), bytes)
      }
      durableWrite(join(stage, 'manifest.json'), JSON.stringify({ format: 1, schemaVersion, databaseHash: sha(plainFile(dbPath)), evidence: hashes, createdAt: new Date().toISOString() }))
      syncDirectory(join(stage, 'evidence')); syncDirectory(stage)
      renameSync(stage, join(backups, id)); syncDirectory(backups)
      return { id, schemaVersion }
    } catch (error) { rmSync(stage, { recursive: true, force: true }); throw error }
  }
  private restore(input: Input<'restore'>): true {
    const source = join(this.directory, 'backups', checkedId(input.backupId))
    const manifest = JSON.parse(Buffer.from(plainFile(join(source, 'manifest.json'))).toString('utf8')) as { format: number; schemaVersion: number; databaseHash: string; evidence: string[] }
    if (manifest.format !== 1 || !Number.isInteger(manifest.schemaVersion) || manifest.schemaVersion < 1 || manifest.schemaVersion > SCHEMA_VERSION
      || !Array.isArray(manifest.evidence) || manifest.evidence.some(h => typeof h !== 'string' || !HASH.test(h))
      || sha(plainFile(join(source, 'store.sqlite'))) !== manifest.databaseHash) throw new StorageError('BACKUP_INVALID')
    if (!input.destination.startsWith('/') && !/^[A-Z]:[/\\]/i.test(input.destination)) throw new StorageError('LOCAL_DATA_DIRECTORY_REQUIRED')
    const destination = resolve(input.destination)
    // mkdir is the atomic no-overwrite check. Existing data is never replaced.
    try { mkdirSync(destination, { mode: 0o700 }) } catch { throw new StorageError('RESTORE_DESTINATION_UNAVAILABLE') }
    try {
      privateDirectory(destination)
      privateDirectory(join(destination, 'evidence'))
      for (const hash of manifest.evidence) {
        const bytes = plainFile(this.evidencePath(hash, source))
        if (sha(bytes) !== hash) throw new StorageError('BACKUP_EVIDENCE_INVALID')
        durableWrite(this.evidencePath(hash, destination), bytes)
      }
      durableWrite(join(destination, 'store.sqlite'), plainFile(join(source, 'store.sqlite')))
      const restored = new DatabaseSync(join(destination, 'store.sqlite'), { readOnly: true })
      try {
        if (!this.databaseOk(restored) || Number(restored.prepare('PRAGMA user_version').get()!.user_version) !== manifest.schemaVersion) throw new StorageError('BACKUP_INVALID')
        const refs = restored.prepare('SELECT hash FROM evidence').all().map(r => String(r.hash)).sort()
        if (JSON.stringify(refs) !== JSON.stringify([...manifest.evidence].sort())) throw new StorageError('BACKUP_INVALID')
      } finally { restored.close() }
      syncDirectory(join(destination, 'evidence')); syncDirectory(destination); syncDirectory(resolve(destination, '..'))
      return true
    } catch (error) { rmSync(destination, { recursive: true, force: true }); throw error }
  }
  async execute<K extends Method>(method: K, input: Input<K>): Promise<Output<K>> {
    validate(method, 'input', input)
    let output: unknown
    switch (method) {
      case 'status': output = { schemaVersion: SCHEMA_VERSION, sqliteVersion: String(this.db.prepare('SELECT sqlite_version() AS v').get()!.v),
        journalMode: String(this.db.prepare('PRAGMA journal_mode').get()!.journal_mode), lockingMode: String(this.db.prepare('PRAGMA locking_mode').get()!.locking_mode),
        observations: Number(this.db.prepare('SELECT count(*) AS n FROM observations').get()!.n), tasks: Number(this.db.prepare('SELECT count(*) AS n FROM tasks').get()!.n),
        evidenceFiles: Number(this.db.prepare('SELECT count(*) AS n FROM evidence').get()!.n) }; break
      case 'observe': output = this.observe(input as Input<'observe'>); break
      case 'observation': output = this.getObservation(input as Input<'observation'>); break
      case 'search': output = this.search(input as Input<'search'>); break
      case 'checkpoint': output = this.checkpoint(input as Input<'checkpoint'>); break
      case 'task': {
        const args = input as Input<'task'>
        const row = this.db.prepare('SELECT payload FROM tasks WHERE scope=? AND id=?').get(scopeKey(args.scope), checkedId(args.id))
        output = row ? JSON.parse(String(row.payload)) : null; break
      }
      case 'backup': output = await this.makeBackup(); break
      case 'restore': output = this.restore(input as Input<'restore'>); break
      case 'check': output = this.check(); break
      case 'rebuildIndex': this.transaction(() => {
        this.db.exec("DELETE FROM observations_fts; INSERT INTO observations_fts(id,title,text) SELECT id,json_extract(payload,'$.title'),json_extract(payload,'$.text') FROM observations;")
      }); output = true; break
    }
    validate(method, 'output', output)
    return output as Output<K>
  }
}
