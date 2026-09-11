import type { Frame } from 'playwright'
import type { Capture } from './contract.js'

export async function readLabels(frame: Frame): Promise<{ title: string; locale: string; entries: Omit<Capture['entries'][number], 'frame' | 'frameUrl'>[]; limitations: string[] }> {
  // This constant function is the entire page evaluation surface; never interpolate page/model code.
  return frame.evaluate(() => {
    const visible = (element: Element): boolean => {
      if (!element.getClientRects().length) return false
      for (let node: Element | null = element; node; node = node.parentElement) {
        const style = getComputedStyle(node)
        if (node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true' || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false
      }
      return true
    }
    const clean = (s: string) => s.replace(/(?:password|passwd|token|secret|authorization|cookie)\s*[:=]\s*\S+/gi, '[redacted]')
      .replace(/\bBearer\s+\S+/gi, '[redacted]').replace(/[A-Za-z0-9_+\/-]{40,}/g, '[redacted]')
      .replace(/\s+/g, ' ').trim().slice(0, 200)
    const nodes = document.querySelectorAll('nav a,aside a,[role="navigation"] a,button,[role="button"],[role="menuitem"],[role="tab"],h1,h2,h3,label,legend')
    const entries: { index: number; kind: string; text: string; group: string; href: string }[] = []
    const limitations: string[] = []
    if (nodes.length > 5000) limitations.push('scan-limit')
    for (let index = 0; index < Math.min(nodes.length, 5000); index++) {
      const node = nodes[index]!
      if (!visible(node) || node.closest('form:has(input[type="password"]),[data-erp-private]')) continue
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
      const labels: string[] = []
      let part: Node | null; let visited = 0
      while ((part = walker.nextNode()) && visited++ < 200) {
        const parent = part.parentElement
        if (parent && visible(parent) && !parent.closest('input,textarea,select,script,style,[data-erp-private]')) labels.push(part.textContent || '')
      }
      const text = clean(node.getAttribute('aria-label') || labels.join(' '))
      if (!text) continue
      const container = node.closest('nav,aside,[role="navigation"],[role="menu"],[role="group"],[role="tablist"]')
      const group = clean(container?.getAttribute('aria-label') || container?.getAttribute('role') || container?.tagName.toLowerCase() || '')
      entries.push({ index, kind: (node.getAttribute('role') || node.tagName.toLowerCase()).slice(0, 100), text, group, href: node instanceof HTMLAnchorElement ? node.href.slice(0, 2000) : '' })
      if (entries.length === 300) { limitations.push('entry-limit'); break }
    }
    if (Array.from(document.querySelectorAll('*')).slice(0, 5000).some(n => n.shadowRoot)) limitations.push('shadow-roots-not-explored')
    return { title: clean(document.title), locale: clean(document.documentElement.lang), entries, limitations }
  })
}
