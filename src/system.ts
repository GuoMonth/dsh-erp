import { createHash, randomUUID } from 'node:crypto'
import { existsSync, linkSync, lstatSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BrowserError, inSite, siteUrl, entryUrl } from './browser/contract.js'
import type { BrowserOpen } from './browser/contract.js'
import { canonicalScope } from './storage/primitives.js'
import { defaultDataDir, privateDirectory } from './storage/paths.js'

export interface SystemConfig { url: string; baseUrl?: string; name?: string; account?: string; tenant?: string; role?: string }
export interface SystemProfile {
  id: string; name: string; entryUrl: string; baseUrl: string; directory: string;
  scope: BrowserOpen['scope']; adapter: 'browser-learning-v1'; legacyDataPresent: boolean
}

// URL lookup is separate from the permanent ID, allowing explicit URL aliases in a future migration.
export function resolveSystem(config: SystemConfig, dataDir = defaultDataDir()): SystemProfile {
  const entry = entryUrl(config.url)
  const inferred = new URL(entry.href); inferred.hash = ''; inferred.search = ''
  if (!config.baseUrl && !inferred.pathname.endsWith('/')) {
    throw new BrowserError('ERP_BASE_URL_REQUIRED: set system.baseUrl to the application root (ending in /)')
  }
  const base = siteUrl(config.baseUrl ?? inferred.href)
  if (!base.pathname.endsWith('/')) throw new BrowserError('ERP_BASE_URL_MUST_END_IN_SLASH')
  if (!inSite(entry.href, base)) throw new BrowserError('ERP_ENTRY_OUTSIDE_BASE_URL')
  const scope = canonicalScope({ site: 'pending', account: config.account?.trim() || 'default',
    ...(config.tenant ? { tenant: config.tenant.trim() } : {}), ...(config.role ? { role: config.role.trim() } : {}) })
  const name = config.name?.trim() || base.hostname
  if (name.length > 200) throw new BrowserError('ERP_SYSTEM_NAME_TOO_LONG')
  const root = privateDirectory(dataDir)
  const systems = privateDirectory(join(root, 'systems'))
  const lookup = privateDirectory(join(systems, 'by-url'))
  const key = createHash('sha256').update(base.href).digest('hex')
  const reference = join(lookup, `${key}.json`)
  if (!existsSync(reference)) {
    const temp = join(lookup, `${randomUUID()}.tmp`)
    writeFileSync(temp, JSON.stringify({ id: `erp_${randomUUID()}`, baseUrl: base.href }), { mode: 0o600, flag: 'wx' })
    try { linkSync(temp, reference) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
    finally { unlinkSync(temp) }
  }
  if (lstatSync(reference).isSymbolicLink() || !lstatSync(reference).isFile()) throw new BrowserError('ERP_INVALID_SYSTEM_REFERENCE')
  const saved = JSON.parse(readFileSync(reference, 'utf8')) as { id: string; baseUrl: string }
  if (!/^erp_[a-f0-9-]{36}$/.test(saved.id) || saved.baseUrl !== base.href) throw new BrowserError('ERP_INVALID_SYSTEM_REFERENCE')
  const directory = privateDirectory(join(systems, saved.id))
  const profile: SystemProfile = { id: saved.id, name, entryUrl: entry.href, baseUrl: base.href, directory,
    scope: { ...scope, site: saved.id }, adapter: 'browser-learning-v1', legacyDataPresent: existsSync(join(root, 'store.sqlite')) }
  const temp = join(directory, `${randomUUID()}.tmp`)
  try {
    writeFileSync(temp, JSON.stringify({ format: 1, id: profile.id, name, baseUrl: base.href, entryUrl: entry.href, adapter: profile.adapter }, null, 2), { mode: 0o600, flag: 'wx' })
    renameSync(temp, join(directory, 'system.json'))
  } finally { if (existsSync(temp)) unlinkSync(temp) }
  return profile
}

export function systemBrowserInput(system: SystemProfile): BrowserOpen {
  return { siteUrl: system.baseUrl, entryUrl: system.entryUrl, scope: structuredClone(system.scope) }
}
