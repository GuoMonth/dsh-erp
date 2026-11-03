import type { Snapshot } from '../browser/snapshot.js'

const ROLE = /(?:^|\n)\s*-?\s*(button|link|menuitem|treeitem|tab|textbox|combobox)\s+"([^"\n]{1,400})"(?:\s+\[ref=([^\]]+)\])?/gi

/** Turn a native accessibility snapshot into the browser-learning-v1 document import already accepts. */
export function nativeSnapshot(raw: string, url: string, observedAt: string): Snapshot {
  const title = raw.match(/Page Title:\s*(.+)/)?.[1]?.trim().slice(0, 300) || 'Native ERP page'
  const controls: Snapshot['controls'] = []
  for (const match of raw.matchAll(ROLE)) {
    if (controls.length >= 300) break
    const role = match[1]!.toLowerCase()
    const name = match[2]!.replace(/\s+/g, ' ').trim()
    if (!name) continue
    const menu = role === 'link' || role === 'menuitem' || role === 'treeitem'
    const field = role === 'textbox' || role === 'combobox'
    const start = (match.index ?? 0) + match[0].length
    const href = raw.slice(start, start + 400).match(/\/url:\s*(\S+)/)?.[1] ?? ''
    let resolved = href
    if (href && !/^[a-z][a-z0-9+.-]*:/i.test(href)) {
      try { resolved = new URL(href, url).href } catch { resolved = '' }
    }
    controls.push({
      ref: (match[3] ?? `n${controls.length + 1}`).slice(0, 80),
      frameUrl: url, kind: field ? 'field' : role, name,
      group: menu ? 'navigation' : role === 'tab' ? 'tablist' : '',
      context: '', href: resolved.startsWith('javascript:') ? '' : resolved,
      value: '', inputType: field ? 'text' : '', disabled: false, options: [],
    })
  }
  return {
    sessionId: 'native', revision: 1, snapshotId: 'native', url, title, observedAt,
    frames: [{ url, title, text: raw.replace(/\s+/g, ' ').trim().slice(0, 12_000) }],
    controls,
    limitations: ['Normalized from a native snapshot so it can be imported as browser-learning-v1. Refs are not managed-browser action targets.'],
  }
}
