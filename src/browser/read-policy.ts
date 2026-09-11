import { readFileSync, lstatSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { createHash } from 'node:crypto'
import { validateJsonSchemaValue, valueSchemaSpecToJsonSchema } from '@deepseek-ai/dsh-tools'
import type { InferValue } from '@deepseek-ai/dsh-tools'
import { scopeSchema, scopeKey } from '../storage/contract.js'
import { BrowserError, inSite, siteUrl } from './contract.js'

const str = { type: 'string', required: true } as const
export const readPolicySchema = { type: 'object', additionalProperties: false, properties: {
  format: { type: 'integer', const: 1, required: true }, id: str, siteUrl: str, scope: { ...scopeSchema, required: true },
  reviewBasis: str,
  requests: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
    id: str, url: str, method: { type: 'string', enum: ['GET', 'POST'], required: true }, body: str,
    contentType: { type: 'string', enum: ['', 'application/json', 'application/x-www-form-urlencoded'], required: true },
  } } },
  routes: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
    id: str, label: str, url: str, requests: { type: 'array', items: { type: 'string' }, required: true },
  } } },
} } as const
export type ReadPolicy = InferValue<typeof readPolicySchema>
export const readPolicyViewSchema = { type: 'object', additionalProperties: false, properties: {
  digest: str, policy: { ...readPolicySchema, required: true },
} } as const
export type ReadPolicyView = InferValue<typeof readPolicyViewSchema>
export const readGrantSchema = { type: 'object', additionalProperties: false, properties: {
  sessionId: str, revision: { type: 'integer', required: true }, policyDigest: str,
  expiresAt: str, remaining: { type: 'integer', required: true },
} } as const
export type ReadGrant = InferValue<typeof readGrantSchema>
export const readEnableSchema = { type: 'object', additionalProperties: false, properties: {
  sessionId: str, revision: { type: 'integer', required: true }, policyDigest: str,
} } as const
export const readNavigateSchema = { type: 'object', additionalProperties: false, properties: {
  ...readEnableSchema.properties, routeId: str,
} } as const
export type ReadNavigate = InferValue<typeof readNavigateSchema>
export function requestUrl(raw: string): string { const url = new URL(raw); url.hash = ''; return url.href }

/** Only an operator-configured local file can introduce read semantics. Never learn an allowlist from traffic. */
export function loadReadPolicy(path: string | undefined): ReadPolicyView {
  if (!path) throw new BrowserError('READ_POLICY_NOT_CONFIGURED')
  try {
    if (!isAbsolute(path) || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink() || lstatSync(path).size > 128_000) throw new Error()
    const policy = JSON.parse(readFileSync(path, 'utf8')) as ReadPolicy
    if (validateJsonSchemaValue(valueSchemaSpecToJsonSchema(readPolicySchema), policy, '').length) throw new Error()
    scopeKey(policy.scope)
    const base = siteUrl(policy.siteUrl)
    const id = (value: string) => { if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value)) throw new Error() }
    const url = (value: string) => { if (value.length > 2000 || !inSite(value, base) || new URL(value).href !== value) throw new Error() }
    id(policy.id)
    if (!policy.reviewBasis.trim() || policy.reviewBasis.length > 4000 || !policy.routes.length || policy.routes.length > 50 || !policy.requests.length || policy.requests.length > 200) throw new Error()
    const requests = new Map(policy.requests.map(request => {
      id(request.id); url(request.url)
      if (new URL(request.url).hash || request.body.length > 8000 || (request.method === 'GET' && (request.body || request.contentType))) throw new Error()
      return [request.id, request] as const
    }))
    if (requests.size !== policy.requests.length || new Set(policy.routes.map(route => route.id)).size !== policy.routes.length) throw new Error()
    for (const route of policy.routes) {
      id(route.id); url(route.url)
      if (!route.label.trim() || route.label.length > 200 || !route.requests.length || route.requests.length > 200 || new Set(route.requests).size !== route.requests.length || route.requests.some(r => !requests.has(r))) throw new Error()
      if (!route.requests.some(r => requests.get(r)!.method === 'GET' && requests.get(r)!.url === requestUrl(route.url))) throw new Error()
    }
    return { policy, digest: createHash('sha256').update(JSON.stringify(policy)).digest('hex') }
  } catch { throw new BrowserError('INVALID_READ_POLICY') }
}
