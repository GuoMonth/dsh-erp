import type { Context } from '@deepseek-ai/cordis'
import type { SiteCatalog } from '../sites/catalog.js'
import { API_PATH } from './names.js'
import { erpFailure, erpRequest } from './api.js'
import type { ErpResult, ExploreStatus } from './api.js'

interface Envelope { type?: unknown; rpcId?: unknown; payload?: unknown }
export interface ErpActions {
  explore(siteId: string): Promise<ExploreStatus>
  exportPack(siteId: string): Promise<{ fileName: string; bytes: string }>
  importPack(siteId: string, bytes: Buffer): Promise<{ warnings: string[] }>
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function merged(catalog: SiteCatalog, extra: Omit<Extract<ErpResult, { ok: true }>['value'], 'sites' | 'lastOpenedId'>): ErpResult {
  const listed = erpRequest(catalog, { op: 'list' })
  if (!listed.ok) return listed
  return { ok: true, value: { ...listed.value, ...extra } }
}

async function desktopAction(catalog: SiteCatalog, actions: ErpActions | undefined, payload: object): Promise<ErpResult> {
  if (!actions) return erpFailure(new Error('ERP_REQUEST_INVALID'))
  const body = payload as { op?: unknown; id?: unknown; bytes?: unknown }
  const id = typeof body.id === 'string' ? body.id.trim() : ''
  if (!id) return erpFailure(new Error('ERP_UNKNOWN_SITE'))
  if (body.op === 'explore') return merged(catalog, { explore: await actions.explore(id) })
  if (body.op === 'export-pack') {
    const pack = await actions.exportPack(id)
    return merged(catalog, { pack })
  }
  if (body.op === 'import-pack') {
    if (typeof body.bytes !== 'string' || !body.bytes) return erpFailure(new Error('SHARE_PACK_FORMAT'))
    const bytes = Buffer.from(body.bytes, 'base64')
    if (!bytes.length || bytes.length > 16_000_000) return erpFailure(new Error('SHARE_PACK_LIMIT'))
    return merged(catalog, { imported: await actions.importPack(id, bytes) })
  }
  return erpFailure(new Error('ERP_REQUEST_INVALID'))
}

/** Owner-only POST on the shared `/api` channel, which the desktop shell already forwards. */
export function registerErpChannel(ctx: Context, catalog: SiteCatalog, actions?: ErpActions): void {
  ctx.inject(['connection'], scope => {
    const host = scope as Context & { connection: { fetch: { register(route: object): () => Promise<void> } } }
    const dispose = host.connection.fetch.register({
      path: API_PATH,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request: Request) => {
        let body: Envelope
        try { body = await request.json() as Envelope }
        catch { return json(400, { error: 'invalid json' }) }
        if (body?.type !== 'client-request' || typeof body.rpcId !== 'string') return json(400, { error: 'invalid rpc envelope' })
        const payload = body.payload
        const op = payload && typeof payload === 'object' ? (payload as { op?: unknown }).op : undefined
        try {
          const result = op === 'explore' || op === 'export-pack' || op === 'import-pack'
            ? await desktopAction(catalog, actions, payload as object)
            : erpRequest(catalog, payload)
          return json(200, { type: 'server-response', rpcId: body.rpcId, result })
        } catch (error) {
          return json(200, { type: 'server-response', rpcId: body.rpcId, result: erpFailure(error) })
        }
      },
    })
    scope.effect(() => () => { void dispose() })
  })
}
