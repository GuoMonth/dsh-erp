/** Client-side entry checks. The host still rejects the same URLs before they are stored. */
export function entryIssue(raw: string): '' | 'empty' | 'url' | 'credentials' | 'query' {
  const value = raw.trim()
  if (!value) return 'empty'
  if (value.length > 2000) return 'url'
  let url: URL
  try { url = new URL(value) } catch { return 'url' }
  if (url.username || url.password) return 'credentials'
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'url'
  if (url.search || url.hash.includes('?')) return 'query'
  return ''
}

/** Empty is allowed. A filled application root must be an HTTP(S) URL ending in /. */
export function baseIssue(raw: string): '' | 'url' | 'slash' {
  const value = raw.trim()
  if (!value) return ''
  const issue = entryIssue(value)
  if (issue === 'credentials' || issue === 'query' || issue === 'url' || issue === 'empty') return 'url'
  let url: URL
  try { url = new URL(value) } catch { return 'url' }
  if (!url.pathname.endsWith('/')) return 'slash'
  return ''
}
