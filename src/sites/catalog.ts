import { createHash, randomUUID } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { StorageClient } from '../storage/client.js'
import { StorageError, scopeKey } from '../storage/primitives.js'
import type { Scope } from '../storage/primitives.js'
import { defaultDataDir, privateDirectory } from '../storage/paths.js'
import { resolveSystem } from '../system.js'
import type { SystemConfig, SystemProfile } from '../system.js'

const SECRET = new Set(['password', 'passwd', 'secret', 'token', 'cookie', 'credential', 'credentials'])

export interface PublicSite {
  id: string
  name: string
  entryUrl: string
  account: string
  workspaceDir: string
  sessionId?: string
}

export interface SessionHint { id?: string; cwd?: string }

export interface Site {
  id: string
  source: 'config' | 'desktop'
  input: SystemConfig
  profile: SystemProfile
  workspaceDir: string
}

interface CatalogFile {
  format: 1
  desktop: SystemConfig[]
  sessions: Record<string, string>
  suppressed: string[]
  labels: Record<string, string>
}

export function rejectSecrets(value: unknown, depth = 0): void {
  if (!value || typeof value !== 'object' || depth > 4) return
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET.has(key.toLowerCase())) throw new Error('ERP_PASSWORD_REJECTED')
    if (inner && typeof inner === 'object') rejectSecrets(inner, depth + 1)
  }
}

function identityOf(profile: SystemProfile): string {
  return [profile.baseUrl, profile.scope.account, profile.scope.tenant ?? '', profile.scope.role ?? ''].join('\n')
}

function catalogId(profile: SystemProfile): string {
  return `site_${createHash('sha256').update(identityOf(profile)).digest('hex').slice(0, 32)}`
}

function normalize(input: SystemConfig): SystemConfig {
  const config: SystemConfig = { url: input.url }
  if (input.baseUrl) config.baseUrl = input.baseUrl
  if (input.name?.trim()) config.name = input.name.trim()
  if (input.account?.trim()) config.account = input.account.trim()
  if (input.tenant?.trim()) config.tenant = input.tenant.trim()
  if (input.role?.trim()) config.role = input.role.trim()
  return config
}

function owns(workspace: string, cwd: string): boolean {
  const root = resolve(workspace)
  const actual = resolve(cwd)
  return actual === root || actual.startsWith(root.endsWith(sep) ? root : root + sep)
}

/** Several ERP sites in one plugin. Each identity keeps its own scope, workspace and session. */
export class SiteCatalog {
  readonly root: string
  private readonly file: string
  private readonly sites = new Map<string, Site>()
  private readonly desktop = new Map<string, SystemConfig>()
  private loadedDesktop: SystemConfig[] = []
  private readonly sessions = new Map<string, string>()
  private readonly labels = new Map<string, string>()
  private readonly suppressed = new Set<string>()
  private readonly clients = new Map<string, StorageClient>()
  private legacy: StorageClient | undefined

  constructor(dataDir: string | undefined, config: { system?: SystemConfig; sites?: SystemConfig[] } = {}) {
    this.root = privateDirectory(dataDir ?? defaultDataDir())
    this.file = join(this.root, 'catalog.json')
    this.load()
    const saved = this.loadedDesktop
    this.loadedDesktop = []
    for (const input of saved) this.materialize(input, 'desktop')
    const declared = [...(config.system ? [config.system] : []), ...(config.sites ?? [])]
    for (const input of declared) this.materialize(input, 'config')
  }

  list(): Site[] { return [...this.sites.values()] }

  sole(): Site | undefined { return this.sites.size === 1 ? this.list()[0] : undefined }

  listPublic(): PublicSite[] { return this.list().map(site => this.toPublic(site)) }

  homeDirectory(): string {
    return this.sites.size === 1 ? this.list()[0]!.profile.directory : this.root
  }

  /** The site this conversation may read. A second site never falls through to the first. */
  select(session: SessionHint | undefined): Site | undefined {
    if (!session?.id) return undefined
    const bound = this.sessions.get(session.id)
    if (bound === '') return undefined
    if (bound) {
      const site = this.sites.get(bound)
      if (site) return site
      this.sessions.set(session.id, '')
      this.save()
      return undefined
    }
    if (session.cwd) {
      const match = this.list().find(site => owns(site.workspaceDir, session.cwd!))
      if (match) { this.remember(session.id, match.id); return match }
    }
    if (this.sites.size === 1) {
      const only = this.list()[0]!
      this.remember(session.id, only.id)
      return only
    }
    return undefined
  }

  /** Storage for a tool call. Unbound conversations cannot borrow another site's scope. */
  route(session: SessionHint | undefined, scope: Scope | undefined): { client: StorageClient; directory: string } {
    const selected = this.select(session)
    if (session?.id && !selected && this.sites.size > 1) throw new StorageError('ERP_SITE_REQUIRED')
    const chosen = selected ?? (!session?.id && this.sites.size === 1 ? this.list()[0] : undefined)
    if (chosen) {
      if (scope && scopeKey(scope) !== scopeKey(chosen.profile.scope)) {
        throw new StorageError('ERP_SCOPE_MISMATCH: use the exact scope from erp_system_status')
      }
      return { client: this.clientFor(chosen), directory: chosen.profile.directory }
    }
    if (this.sites.size > 0) throw new StorageError('ERP_SITE_REQUIRED')
    return { client: this.legacyClient(), directory: this.root }
  }

  statusSite(session: SessionHint | undefined): Site | undefined {
    const selected = this.select(session)
    if (selected) return selected
    if (session?.id && this.sites.size > 1) return undefined
    if (!session?.id && this.sites.size === 1) return this.list()[0]
    return undefined
  }

  add(input: SystemConfig): PublicSite {
    rejectSecrets(input)
    const site = this.materialize(input, 'desktop')
    if (!site) throw new Error('ERP_SITE_REJECTED')
    this.save()
    return this.toPublic(site)
  }

  remove(id: string): PublicSite[] {
    const site = this.sites.get(id)
    if (!site) throw new Error('ERP_UNKNOWN_SITE')
    this.sites.delete(id)
    this.desktop.delete(id)
    this.labels.delete(id)
    this.suppressed.add(identityOf(site.profile))
    for (const [sessionId, siteId] of this.sessions) if (siteId === id) this.sessions.set(sessionId, '')
    this.save()
    return this.listPublic()
  }

  bind(sessionId: string, siteId: string): PublicSite {
    if (!/^[\w.:-]{1,200}$/.test(sessionId)) throw new Error('ERP_SESSION_ID')
    const site = this.sites.get(siteId)
    if (!site) throw new Error('ERP_UNKNOWN_SITE')
    const existing = this.sessions.get(sessionId)
    if (existing && existing !== siteId) throw new Error('ERP_SESSION_BOUND')
    this.remember(sessionId, siteId)
    return this.toPublic(site)
  }

  toPublic(site: Site): PublicSite {
    const view: PublicSite = {
      id: site.id, name: site.profile.name, entryUrl: site.profile.entryUrl,
      account: site.profile.scope.account, workspaceDir: site.workspaceDir,
    }
    const sessionId = this.primarySession(site.id)
    if (sessionId) view.sessionId = sessionId
    return view
  }

  async dispose(): Promise<void> {
    const clients = [...this.clients.values()]
    if (this.legacy) clients.push(this.legacy)
    this.clients.clear()
    this.legacy = undefined
    await Promise.all(clients.map(client => client.dispose()))
  }

  private primarySession(siteId: string): string | undefined {
    let found: string | undefined
    for (const [sessionId, bound] of this.sessions) if (bound === siteId) found = sessionId
    return found
  }

  private remember(sessionId: string, siteId: string): void {
    this.sessions.delete(sessionId)
    this.sessions.set(sessionId, siteId)
    this.save()
  }

  private materialize(input: SystemConfig, source: 'config' | 'desktop'): Site | undefined {
    rejectSecrets(input)
    const normalized = normalize(input)
    const resolved = resolveSystem(normalized, this.root)
    const identity = identityOf(resolved)
    if (source === 'config' && this.suppressed.has(identity)) return undefined
    if (source === 'desktop') this.suppressed.delete(identity)
    const id = catalogId(resolved)
    const label = source === 'desktop' && normalized.name ? normalized.name : this.labels.get(id)
    if (source === 'desktop' && normalized.name) this.labels.set(id, normalized.name)
    const profile = label ? { ...resolved, name: label } : resolved
    const workspaceDir = privateDirectory(join(profile.directory, 'workspaces', id))
    const existing = this.sites.get(id)
    if (existing) {
      existing.profile = profile
      existing.input = normalized
      existing.workspaceDir = workspaceDir
      if (source === 'desktop') existing.source = 'desktop'
    } else {
      this.sites.set(id, { id, source, input: normalized, profile, workspaceDir })
    }
    if (source === 'desktop') this.desktop.set(id, normalized)
    return this.sites.get(id)
  }

  private clientFor(site: Site): StorageClient {
    const directory = site.profile.directory
    let client = this.clients.get(directory)
    if (!client) {
      client = new StorageClient({ directory })
      this.clients.set(directory, client)
    }
    return client
  }

  private legacyClient(): StorageClient {
    return this.legacy ??= new StorageClient({ directory: this.root })
  }

  private load(): void {
    if (!existsSync(this.file)) return
    const stat = lstatSync(this.file)
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('ERP_INVALID_CATALOG')
    const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<CatalogFile>
    if (parsed.format !== 1 || !Array.isArray(parsed.desktop) || !parsed.sessions || !Array.isArray(parsed.suppressed)) {
      throw new Error('ERP_INVALID_CATALOG')
    }
    for (const input of parsed.desktop) {
      if (!input || typeof input.url !== 'string') throw new Error('ERP_INVALID_CATALOG')
      rejectSecrets(input)
      this.loadedDesktop.push(input)
    }
    for (const [sessionId, siteId] of Object.entries(parsed.sessions)) {
      if (typeof sessionId === 'string' && typeof siteId === 'string') this.sessions.set(sessionId, siteId)
    }
    for (const identity of parsed.suppressed) if (typeof identity === 'string') this.suppressed.add(identity)
    for (const [id, name] of Object.entries(parsed.labels ?? {})) if (typeof name === 'string') this.labels.set(id, name)
  }

  private save(): void {
    const body: CatalogFile = {
      format: 1,
      desktop: [...this.desktop.values()],
      sessions: Object.fromEntries(this.sessions),
      suppressed: [...this.suppressed],
      labels: Object.fromEntries(this.labels),
    }
    const temp = join(this.root, `${randomUUID()}.tmp`)
    try {
      writeFileSync(temp, JSON.stringify(body), { mode: 0o600, flag: 'wx' })
      renameSync(temp, this.file)
    } finally { if (existsSync(temp)) unlinkSync(temp) }
  }
}
