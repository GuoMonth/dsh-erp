import type { InferValue, ValueSchemaSpec } from '@deepseek-ai/dsh-tools'
import { scopeSchema } from '../storage/contract.js'

const str = { type: 'string', required: true } as const
const num = { type: 'integer', required: true } as const
export const browserStatusSchema = { type: 'object', additionalProperties: false, properties: {
  state: { type: 'string', enum: ['closed', 'preparing', 'manual', 'observing'], required: true },
  revision: num, sessionId: str, reason: str, pages: num, pageUrl: str,
} } as const satisfies ValueSchemaSpec
export type BrowserStatus = InferValue<typeof browserStatusSchema>
export const browserOpenSchema = { type: 'object', additionalProperties: false, properties: {
  siteUrl: str, entryUrl: { type: 'string' }, scope: { ...scopeSchema, required: true },
} } as const satisfies ValueSchemaSpec
export type BrowserOpen = InferValue<typeof browserOpenSchema>
export const captureSchema = { type: 'object', additionalProperties: false, properties: {
  sessionId: str, revision: num, url: str, title: str, locale: str, observedAt: str,
  entries: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
    frame: num, frameUrl: str, index: num, kind: str, text: str, group: str, href: str,
  } } },
  limitations: { type: 'array', items: { type: 'string' }, required: true },
} } as const satisfies ValueSchemaSpec
export type Capture = InferValue<typeof captureSchema>
export class BrowserError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'BrowserError' }
}
export function siteUrl(raw: string): URL {
  if (raw.length > 2000) throw new BrowserError('INVALID_SITE_URL')
  let url: URL
  try { url = new URL(raw) } catch { throw new BrowserError('INVALID_SITE_URL') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new BrowserError('INVALID_SITE_URL')
  return url
}
export function inSite(raw: string, base: URL): boolean {
  try {
    const url = new URL(raw)
    const prefix = base.pathname.endsWith('/') ? base.pathname : `${base.pathname}/`
    return url.origin === base.origin && (url.pathname === base.pathname || url.pathname.startsWith(prefix)) && !url.username && !url.password
  } catch { return false }
}
export function entryUrl(raw: string): URL {
  if (raw.length > 2000) throw new BrowserError('INVALID_ENTRY_URL')
  let url: URL
  try { url = new URL(raw) } catch { throw new BrowserError('INVALID_ENTRY_URL') }
  // Saved entry points are durable settings, never transient signed/credential-bearing login links.
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash.includes('?')) {
    throw new BrowserError('INVALID_ENTRY_URL: use an HTTP(S) entry without credentials or query parameters')
  }
  return url
}
export function cleanUrl(raw: string): string {
  try {
    const url = new URL(raw)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return ''
    url.search = ''; url.hash = url.hash.split('?')[0] ?? ''
    return url.href
  } catch { return '' }
}
