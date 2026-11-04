import { normalizeBookmark } from './bookmark.js'

/** A paste can be stored when it normalizes to an http(s) bookmark. Deep links are not rejected here. */
export function entryIssue(raw: string): '' | 'empty' | 'url' {
  const value = raw.trim()
  if (!value) return 'empty'
  try { normalizeBookmark(value); return '' } catch (error) {
    return error instanceof Error && error.message === 'ERP_URL_REQUIRED' ? 'empty' : 'url'
  }
}

/** Not collected on the desktop form. An explicit application root in a config file must end in /. */
export function baseIssue(raw: string): '' | 'url' | 'slash' {
  const value = raw.trim()
  if (!value) return ''
  let url: URL
  try { url = new URL(value) } catch { return 'url' }
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'http:' && url.protocol !== 'https:')) return 'url'
  if (!url.pathname.endsWith('/')) return 'slash'
  return ''
}
