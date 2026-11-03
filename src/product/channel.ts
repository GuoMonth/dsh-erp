import type { Context } from '@deepseek-ai/cordis'
import type { SiteCatalog } from '../sites/catalog.js'
import { API_PATH } from './names.js'
import { erpRequest } from './api.js'

interface Envelope { type?: unknown; rpcId?: unknown; payload?: unknown }

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

/** Owner-only POST on the shared `/api` channel, which the desktop shell already forwards. */
export function registerErpChannel(ctx: Context, catalog: SiteCatalog): void {
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
        return json(200, { type: 'server-response', rpcId: body.rpcId, result: erpRequest(catalog, body.payload) })
      },
    })
    // The route is owned by this plugin. Drop it when the fiber unloads.
    scope.effect(() => () => { void dispose() })
  })
}
