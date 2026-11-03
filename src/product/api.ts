import { rejectSecrets } from '../sites/catalog.js'
import type { PublicSite, SiteCatalog } from '../sites/catalog.js'
import type { SystemConfig } from '../system.js'

export interface ErpFailure { code: string; message: string; details: Record<string, never> }
export type ErpResult = { ok: true; value: { sites: PublicSite[] } } | { ok: false; error: ErpFailure }

function fail(error: unknown): ErpResult {
  const message = error instanceof Error ? error.message : 'ERP_REQUEST_FAILED'
  const code = message.startsWith('ERP_') ? message.split(':')[0]! : 'ERP_REQUEST_FAILED'
  return { ok: false, error: { code, message, details: {} } }
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/** Desktop guide calls. Passwords are rejected and never written. */
export function erpRequest(catalog: SiteCatalog, payload: unknown): ErpResult {
  try {
    rejectSecrets(payload)
    if (!payload || typeof payload !== 'object' || typeof (payload as { op?: unknown }).op !== 'string') {
      return fail(new Error('ERP_REQUEST_INVALID'))
    }
    const body = payload as { op: string; url?: unknown; baseUrl?: unknown; name?: unknown; account?: unknown; tenant?: unknown; role?: unknown; id?: unknown; siteId?: unknown; sessionId?: unknown }
    if (body.op === 'list') return { ok: true, value: { sites: catalog.listPublic() } }
    if (body.op === 'add') {
      const url = text(body.url)
      if (!url) return fail(new Error('ERP_URL_REQUIRED'))
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
      catalog.add(input)
      return { ok: true, value: { sites: catalog.listPublic() } }
    }
    if (body.op === 'remove') {
      const id = text(body.id)
      if (!id) return fail(new Error('ERP_UNKNOWN_SITE'))
      return { ok: true, value: { sites: catalog.remove(id) } }
    }
    if (body.op === 'bind') {
      const siteId = text(body.siteId)
      const sessionId = text(body.sessionId)
      if (!siteId || !sessionId) return fail(new Error('ERP_SESSION_ID'))
      catalog.bind(sessionId, siteId)
      return { ok: true, value: { sites: catalog.listPublic() } }
    }
    return fail(new Error('ERP_REQUEST_INVALID'))
  } catch (error) { return fail(error) }
}
