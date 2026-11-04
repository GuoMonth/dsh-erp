import { normalizeBookmark } from './bookmark.js'

/**
 * Icons for the plugin's own site list.
 * A candidate is derived from the public bookmark. Userinfo, query, and hash are removed.
 * These URLs are display-only: do not write them into the share pack or the site catalog.
 */

const HTML_LIMIT = 200_000
const DATA_LIMIT = 4096
const DATA_IMAGE = /^data:image\/(?:png|gif|jpeg|webp|x-icon|vnd\.microsoft\.icon);base64,[a-z0-9+/=]+$/i
const LINK_RE = /<link\b([^>]*)>/gi

export interface IconResponse {
  url: string
  contentType: string
  text(): Promise<string>
  /** Drop an unread body. Pages that are not HTML are not downloaded. */
  release?(): Promise<void>
}

export type IconFetch = (url: string, init: { signal: AbortSignal }) => Promise<IconResponse>

export type IconView =
  | { status: 'loading'; hrefs: string[]; index: number }
  | { status: 'ready'; href: string }
  | { status: 'fallback' }

interface IconLink { href: string; rel: string; sizes?: string; type?: string }

const cache = new Map<string, string[]>()
const flights = new Map<string, Promise<string[]>>()

export function resetSiteIcons(): void {
  cache.clear()
  flights.clear()
}

/** Stable bookmark entry. Icons for one entry are fetched once. */
export function iconKey(entryUrl: string): string | undefined {
  try { return normalizeBookmark(entryUrl).entryUrl } catch { return undefined }
}

export function iconView(hrefs: readonly string[]): IconView {
  const list = [...hrefs]
  return list.length ? { status: 'loading', hrefs: list, index: 0 } : { status: 'fallback' }
}

export function iconHref(view: IconView): string | undefined {
  if (view.status === 'ready') return view.href
  if (view.status === 'loading') return view.hrefs[view.index]
  return undefined
}

export function iconLoaded(view: IconView): IconView {
  const href = iconHref(view)
  if (view.status !== 'loading' || !href) return view.status === 'ready' ? view : { status: 'fallback' }
  return { status: 'ready', href }
}

export function iconFailed(view: IconView): IconView {
  if (view.status !== 'loading') return view
  const index = view.index + 1
  return view.hrefs[index] ? { status: 'loading', hrefs: view.hrefs, index } : { status: 'fallback' }
}

/** Keep a confirmed icon. A still-loading row adopts newly parsed addresses and skips ones that already failed. */
export function iconDiscovered(view: IconView, hrefs: readonly string[], failed: readonly string[]): IconView {
  if (view.status === 'ready') return view
  const fresh = hrefs.filter(href => !failed.includes(href))
  if (!fresh.length) return view.status === 'fallback' ? view : { status: 'fallback' }
  if (view.status === 'loading' && sameList(fresh, view.hrefs.slice(view.index))) return view
  return { status: 'loading', hrefs: fresh, index: 0 }
}

/**
 * Ordered icon URLs for a bookmark. The last candidate is `/favicon.ico` on that origin.
 * HTML from another origin is ignored. Cross-origin and non-http targets are dropped.
 */
export function siteIconCandidates(entryUrl: string, html?: string, documentUrl?: string): string[] {
  let entry: URL
  try { entry = new URL(normalizeBookmark(entryUrl).entryUrl) } catch { return [] }
  let base = entry
  let source = html
  if (documentUrl) {
    try {
      const doc = new URL(documentUrl)
      const usable = (doc.protocol === 'http:' || doc.protocol === 'https:') && doc.origin === entry.origin && !doc.username && !doc.password
      if (!usable) source = undefined
      else base = doc
    } catch { source = undefined }
  }
  const ranked: { href: string; score: number; order: number }[] = []
  if (source) {
    for (const [order, link] of readIconLinks(source).entries()) {
      const href = absoluteIcon(link.href, base, entry.origin)
      if (!href) continue
      ranked.push({ href, score: iconScore(link), order })
    }
  }
  ranked.sort((left, right) => left.score - right.score || left.order - right.order)
  const hrefs = ranked.map(item => item.href)
  hrefs.push(new URL('/favicon.ico', entry.origin).href)
  return [...new Set(hrefs)]
}

/** Fetch the public bookmark page once per entry. A timeout, non-HTML body, or thrown fetch keeps `/favicon.ico`. */
export async function loadSiteIcons(entryUrl: string, fetchHtml: IconFetch, timeoutMs = 2500): Promise<string[]> {
  const key = iconKey(entryUrl)
  if (!key) return []
  const saved = cache.get(key)
  if (saved) return saved
  const pending = flights.get(key)
  if (pending) return pending
  const task = resolveIcons(entryUrl, fetchHtml, timeoutMs).then(list => {
    cache.set(key, list)
    flights.delete(key)
    return list
  }, () => {
    flights.delete(key)
    const fallback = siteIconCandidates(entryUrl)
    cache.set(key, fallback)
    return fallback
  })
  flights.set(key, task)
  return task
}

async function resolveIcons(entryUrl: string, fetchHtml: IconFetch, timeoutMs: number): Promise<string[]> {
  const fallback = siteIconCandidates(entryUrl)
  if (!fallback.length) return []
  const page = new URL(normalizeBookmark(entryUrl).entryUrl)
  const signal = AbortSignal.timeout(timeoutMs)
  const response = await fetchHtml(page.href, { signal })
  const type = response.contentType ?? ''
  const htmlType = /text\/html|application\/xhtml\+xml/i.test(type)
  const bare = type.trim() === ''
  if (!htmlType && !bare) { await response.release?.(); return fallback }
  let final = page
  if (response.url) {
    const doc = new URL(response.url)
    const usable = (doc.protocol === 'http:' || doc.protocol === 'https:') && doc.origin === page.origin && !doc.username && !doc.password
    if (!usable) { await response.release?.(); return fallback }
    final = doc
  }
  const html = (await response.text()).slice(0, HTML_LIMIT)
  if (bare && !/<(?:!doctype|html|head|link)\b/i.test(html.slice(0, 4000))) return fallback
  return siteIconCandidates(entryUrl, html, final.href)
}

function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((href, index) => href === right[index])
}

function readIconLinks(html: string): IconLink[] {
  const links: IconLink[] = []
  for (const match of html.matchAll(LINK_RE)) {
    const source = match[1] ?? ''
    const rel = attribute(source, 'rel')
    const href = attribute(source, 'href')
    if (!rel || !href || !isIconRel(rel)) continue
    const type = attribute(source, 'type')
    if (type && !/^image\/(?:png|gif|jpeg|webp|svg\+xml|x-icon|vnd\.microsoft\.icon|ico)$/i.test(type)) continue
    const sizes = attribute(source, 'sizes')
    const link: IconLink = { href, rel }
    if (sizes) link.sizes = sizes
    if (type) link.type = type
    links.push(link)
  }
  return links
}

function isIconRel(rel: string): boolean {
  const tokens = rel.toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.some(token => token === 'stylesheet' || token === 'manifest' || token === 'preload' || token === 'mask-icon')) return false
  return tokens.includes('icon') || tokens.includes('apple-touch-icon') || tokens.includes('apple-touch-icon-precomposed')
}

function iconScore(link: IconLink): number {
  const apple = /apple-touch-icon/i.test(link.rel) ? 400 : 0
  const size = iconSize(link.sizes)
  const distance = size === undefined ? 24 : Math.abs(size - 32)
  const svg = link.type && /svg/i.test(link.type) ? 2 : 0
  return apple + distance + svg
}

function iconSize(sizes: string | undefined): number | undefined {
  if (!sizes) return undefined
  if (/\bany\b/i.test(sizes)) return 32
  let best: number | undefined
  for (const match of sizes.matchAll(/(\d+)\s*x\s*(\d+)/gi)) {
    const edge = Math.min(Number(match[1]), Number(match[2]))
    if (!edge) continue
    if (best === undefined || Math.abs(edge - 32) < Math.abs(best - 32)) best = edge
  }
  return best
}

function absoluteIcon(raw: string, base: URL, origin: string): string | undefined {
  const value = raw.trim()
  if (!value || value.length > DATA_LIMIT) return undefined
  if (/^data:/i.test(value)) {
    const compact = value.replace(/\s+/g, '')
    return DATA_IMAGE.test(compact) && compact.length <= DATA_LIMIT ? compact : undefined
  }
  if (value.length > 2000) return undefined
  let url: URL
  try { url = new URL(value, base) } catch { return undefined }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password || url.origin !== origin) return undefined
  url.search = ''
  url.hash = ''
  return url.href
}

function attribute(source: string, name: string): string | undefined {
  const match = source.match(new RegExp(`(?:^|[\\s/])${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\\\`]+))`, 'i'))
  const raw = match?.[1] ?? match?.[2] ?? match?.[3]
  return raw === undefined ? undefined : decodeEntities(raw).trim()
}

function decodeEntities(value: string): string {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
}
