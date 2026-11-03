import { rejectSecrets } from '../sites/catalog.js'
import type { PublicSite, SiteCatalog, SitePatch } from '../sites/catalog.js'
import type { SystemConfig } from '../system.js'

export interface ErpFailure { code: string; message: string; details: Record<string, never> }
export interface GuideValue { sites: PublicSite[]; lastOpenedId: string }
export type ErpResult = { ok: true; value: GuideValue } | { ok: false; error: ErpFailure }

function fail(error: unknown): ErpResult {
  const message = error instanceof Error ? error.message : 'ERP_REQUEST_FAILED'
  const head = message.split(':')[0] || 'ERP_REQUEST_FAILED'
  const code = /^(ERP_|INVALID_)/.test(head) ? head : 'ERP_REQUEST_FAILED'
  return { ok: false, error: { code, message, details: {} } }
}

function ok(catalog: SiteCatalog): ErpResult {
  return { ok: true, value: { sites: catalog.listPublic(), lastOpenedId: catalog.lastOpened() } }
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function siteInput(body: { url?: unknown; baseUrl?: unknown; name?: unknown; account?: unknown; tenant?: unknown; role?: unknown }): SystemConfig | undefined {
  const url = text(body.url)
  if (!url) return undefined
  const input: SystemConfig = { url }
  const baseUrl = text(body.baseUrl)
  const name = text(body.name)
  const account = text(body.account)
  const tenant = text(body.tenant)
  const role = text(body.role)
  if (baseUrl) input.baseUrl = baseUrl
  if (name) input.name = name
  if (account) input.account = account
  if (tenant) input.tenant = tenant
  if (role) input.role = role
  return input
}

/** Desktop guide calls. Passwords are rejected and never written. */
export function erpRequest(catalog: SiteCatalog, payload: unknown): ErpResult {
  try {
    rejectSecrets(payload)
    if (!payload || typeof payload !== 'object' || typeof (payload as { op?: unknown }).op !== 'string') {
      return fail(new Error('ERP_REQUEST_INVALID'))
    }
    const body = payload as { op: string; url?: unknown; baseUrl?: unknown; name?: unknown; account?: unknown; tenant?: unknown; role?: unknown; id?: unknown; siteId?: unknown; sessionId?: unknown }
    if (body.op === 'list') return ok(catalog)
    if (body.op === 'add') {
      const input = siteInput(body)
      if (!input) return fail(new Error('ERP_URL_REQUIRED'))
      catalog.add(input)
      return ok(catalog)
    }
    if (body.op === 'update') {
      const id = text(body.id)
      const url = text(body.url)
      if (!id || !url) return fail(new Error(!url ? 'ERP_URL_REQUIRED' : 'ERP_UNKNOWN_SITE'))
      const patch: SitePatch = { url }
      if ('baseUrl' in body) patch.baseUrl = text(body.baseUrl) ?? null
      if ('name' in body) patch.name = text(body.name) ?? null
      if ('account' in body) patch.account = text(body.account) ?? null
      if ('tenant' in body) patch.tenant = text(body.tenant) ?? null
      if ('role' in body) patch.role = text(body.role) ?? null
      catalog.update(id, patch)
      return ok(catalog)
    }
    if (body.op === 'opened') {
      const id = text(body.id)
      if (!id) return fail(new Error('ERP_UNKNOWN_SITE'))
      catalog.markOpened(id)
      return ok(catalog)
    }
    if (body.op === 'remove') {
      const id = text(body.id)
      if (!id) return fail(new Error('ERP_UNKNOWN_SITE'))
      catalog.remove(id)
      return ok(catalog)
    }
    if (body.op === 'bind') {
      const siteId = text(body.siteId)
      const sessionId = text(body.sessionId)
      if (!siteId || !sessionId) return fail(new Error('ERP_SESSION_ID'))
      catalog.bind(sessionId, siteId)
      return ok(catalog)
    }
    return fail(new Error('ERP_REQUEST_INVALID'))
  } catch (error) { return fail(error) }
}
