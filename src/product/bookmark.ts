const CALLBACK = new Set(['callback', 'oauth', 'authorize', 'oidc', 'saml', 'sso', 'redirect'])
const RECORD = new Set(['record', 'records', 'document', 'documents', 'doc', 'invoice', 'invoices', 'order', 'orders', 'form', 'view', 'edit', 'report', 'reports', 'download', 'attachment', 'attachments', 'content', 'object', 'objects', 'item', 'items', 'detail', 'details'])
const LOGIN = new Set(['login', 'signin', 'sign-in', 'log-in', 'logon', 'logout'])
const ONE_TIME_KEY = /^(?:access_token|refresh_token|id_token|token|code|state|ticket|nonce|session|error|error_description|expires_in|auth|authorization)$/i

export interface Bookmark { entryUrl: string; baseUrl: string }

function isId(segment: string): boolean {
  return /^\d+$/.test(segment) || /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(segment)
}

/** Drop one-time fragments. A hash route that is the app home stays; a record route becomes `#/`. */
function stableHash(hash: string): string {
  if (!hash || hash === '#') return ''
  const body = hash.slice(1)
  const queryAt = body.indexOf('?')
  const route = queryAt === -1 ? body : body.slice(0, queryAt)
  if (!route) return ''
  const pairs = route.split('&')
  if (pairs.every(pair => ONE_TIME_KEY.test(pair.split('=')[0] ?? ''))) return ''
  if (route.startsWith('/')) {
    const parts = route.split('/').filter(Boolean)
    const deep = !parts.length || parts.some(part => isId(part) || RECORD.has(part.toLowerCase()) || CALLBACK.has(part.toLowerCase()))
    return deep ? '#/' : `#/${parts.join('/')}`
  }
  if (route.includes('=')) return ''
  return /^[\w.-]{1,40}$/.test(route) ? `#${route}` : ''
}

/**
 * Turn a pasted ERP address into the bookmark entry and the stable application root.
 * Userinfo and one-time query or hash material are removed and never returned.
 */
export function normalizeBookmark(raw: string): Bookmark {
  const value = raw.trim()
  if (!value) throw new Error('ERP_URL_REQUIRED')
  if (value.length > 2000) throw new Error('INVALID_ENTRY_URL')
  let url: URL
  try { url = new URL(value) } catch { throw new Error('INVALID_ENTRY_URL') }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('INVALID_ENTRY_URL')
  url.username = ''
  url.password = ''
  url.search = ''
  const hash = stableHash(url.hash)
  const parts = url.pathname.split('/').filter(Boolean)
  let cut = parts.length
  for (let index = 0; index < parts.length; index++) {
    const word = parts[index]!.toLowerCase()
    const next = parts[index + 1]
    if (CALLBACK.has(word) || isId(parts[index]!)) { cut = index; break }
    if (RECORD.has(word) && (index > 0 || (next !== undefined && isId(next)))) { cut = index; break }
  }
  const kept = parts.slice(0, cut)
  const last = kept[kept.length - 1]?.toLowerCase()
  const login = Boolean(last && LOGIN.has(last))
  const baseParts = login ? kept.slice(0, -1) : kept
  const origin = url.origin
  const baseUrl = new URL(`${origin}${baseParts.length ? `/${baseParts.join('/')}/` : '/'}`).href
  const entryPath = login ? `/${kept.join('/')}` : (baseParts.length ? `/${baseParts.join('/')}/` : '/')
  const entry = new URL(`${origin}${entryPath}`)
  entry.hash = hash
  return { entryUrl: entry.href, baseUrl }
}
