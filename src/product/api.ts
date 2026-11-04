import { rejectSecrets } from '../sites/catalog.js'
import type { PublicSite, SiteCatalog, SitePatch } from '../sites/catalog.js'
import type { SystemConfig } from '../system.js'

export interface ErpFailure { code: string; message: string; details: Record<string, never> }
export interface ExploreStatus { state: string; reason: string; pausedUntilLogin: boolean; complete: boolean; version: number }
export interface GuideValue {
  sites: PublicSite[]
  lastOpenedId: string
  explore?: ExploreStatus
  pack?: { fileName: string; bytes: string }
  imported?: { warnings: string[] }
}
export type ErpResult = { ok: true; value: GuideValue } | { ok: false; error: ErpFailure }

export function erpFailure(error: unknown): ErpResult {
  const message = error instanceof Error ? error.message : 'ERP_REQUEST_FAILED'
  const head = message.split(':')[0] || 'ERP_REQUEST_FAILED'
  const code = /^(ERP_|INVALID_|SHARE_PACK_)/.test(head) ? head : 'ERP_REQUEST_FAILED'
  return { ok: false, error: { code, message, details: {} } }
}

function ok(catalog: SiteCatalog): ErpResult {
  return { ok: true, value: { sites: catalog.listPublic(), lastOpenedId: catalog.lastOpened() } }
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function siteInput(body: { url?: unknown; name?: unknown }): SystemConfig | undefined {
  const url = text(body.url)
  if (!url) return undefined
  const input: SystemConfig = { url }
  const name = text(body.name)
  if (name) input.name = name
  return input
}

/** Desktop guide calls. Passwords are rejected and never written. */
export function erpRequest(catalog: SiteCatalog, payload: unknown): ErpResult {
  try {
    rejectSecrets(payload)
    if (!payload || typeof payload !== 'object' || typeof (payload as { op?: unknown }).op !== 'string') {
      return erpFailure(new Error('ERP_REQUEST_INVALID'))
    }
    const body = payload as { op: string; url?: unknown; name?: unknown; id?: unknown; siteId?: unknown; sessionId?: unknown }
    if (body.op === 'list') return ok(catalog)
    if (body.op === 'add') {
      const input = siteInput(body)
      if (!input) return erpFailure(new Error('ERP_URL_REQUIRED'))
      catalog.add(input)
      return ok(catalog)
    }
    if (body.op === 'update') {
      const id = text(body.id)
      const url = text(body.url)
      if (!id || !url) return erpFailure(new Error(!url ? 'ERP_URL_REQUIRED' : 'ERP_UNKNOWN_SITE'))
      const patch: SitePatch = { url }
      if ('name' in body) patch.name = text(body.name) ?? null
      catalog.update(id, patch)
      return ok(catalog)
    }
    if (body.op === 'opened') {
      const id = text(body.id)
      if (!id) return erpFailure(new Error('ERP_UNKNOWN_SITE'))
      catalog.markOpened(id)
      return ok(catalog)
    }
    if (body.op === 'remove') {
      const id = text(body.id)
      if (!id) return erpFailure(new Error('ERP_UNKNOWN_SITE'))
      catalog.remove(id)
      return ok(catalog)
    }
    if (body.op === 'bind') {
      const siteId = text(body.siteId)
      const sessionId = text(body.sessionId)
      if (!siteId || !sessionId) return erpFailure(new Error('ERP_SESSION_ID'))
      catalog.bind(sessionId, siteId)
      return ok(catalog)
    }
    return erpFailure(new Error('ERP_REQUEST_INVALID'))
  } catch (error) { return erpFailure(error) }
}
