import { createHash, randomUUID } from 'node:crypto'
import type { ElementHandle, Page } from 'playwright'
import type { InferValue } from '@deepseek-ai/dsh-tools'
import { BrowserError, cleanUrl, inSite } from './contract.js'

const str = { type: 'string', required: true } as const
export const snapshotSchema = { type: 'object', additionalProperties: false, properties: {
  sessionId: str, revision: { type: 'integer', required: true }, snapshotId: str, url: str, title: str, observedAt: str,
  frames: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
    url: str, title: str, text: str,
  } } },
  controls: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
    ref: str, frameUrl: str, kind: str, name: str, group: str, context: str, href: str, value: str, inputType: str,
    disabled: { type: 'boolean', required: true }, options: { type: 'array', items: { type: 'string' }, required: true },
  } } },
  limitations: { type: 'array', items: { type: 'string' }, required: true },
} } as const
export type Snapshot = InferValue<typeof snapshotSchema>
export const actionSchema = { type: 'object', additionalProperties: false, properties: {
  sessionId: str, revision: { type: 'integer', required: true }, snapshotId: str, ref: str,
  operation: { type: 'string', enum: ['click', 'fill', 'select', 'scroll'], required: true },
  value: { type: 'string' }, reason: str,
} } as const
export type BrowserAction = InferValue<typeof actionSchema>
type Handle = ElementHandle<SVGElement | HTMLElement>
const selector = 'a,button,input,textarea,select,summary,[role="button"],[role="menuitem"],[role="tab"],[role="combobox"],[role="treeitem"],[role="option"],[role="checkbox"],[role="radio"],[role="switch"],[role="link"],[role="textbox"],[contenteditable="true"],[onclick],[tabindex]'
const hash = (s: string) => createHash('sha256').update(s).digest('hex')

// Fixed DOM extraction, never model-supplied code. Input values are included only for non-credential fields.
function describe(element: Element) {
  const visible = (node: Element): boolean => {
    if (!node.getClientRects().length) return false
    for (let e: Element | null = node; e; e = e.parentElement) {
      const style = getComputedStyle(e)
      if (e.hasAttribute('hidden') || e.getAttribute('aria-hidden') === 'true' || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false
    }
    return true
  }
  const clean = (s: string) => s.replace(/(?:password|passwd|token|secret|authorization|cookie)\s*[:=]\s*\S+/gi, '[redacted]')
    .replace(/\bBearer\s+\S+/gi, '[redacted]').replace(/\bsk-[a-zA-Z0-9_-]{16,}/g, '[redacted]')
    .replace(/[A-Za-z0-9_+\/-]{40,}/g, '[redacted]').replace(/\s+/g, ' ').trim().slice(0, 400)
  const textOf = (root: Element) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let node: Node | null, count = 0, text = ''
    while ((node = walker.nextNode()) && count++ < 1000 && text.length < 4000) {
      const parent = node.parentElement
      if (parent && visible(parent) && !parent.closest('input,textarea,select,script,style,[data-erp-private],form:has(input[type="password"])')) text += (node.textContent ?? '') + ' '
    }
    return text
  }
  if (!visible(element) || element.closest('[data-erp-private],form:has(input[type="password"])')) return null
  const field = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement
  const type = element instanceof HTMLInputElement ? element.type : ''
  if (['password', 'hidden', 'file'].includes(type) || /password|passwd|token|secret|otp|one-time|username|cc-number|cc-csc/i.test([
    element.getAttribute('autocomplete'), element.getAttribute('name'), element.id, element.getAttribute('aria-label'),
  ].join(' '))) return null
  const label = element.getAttribute('aria-label') || element.getAttribute('title') ||
    (field ? Array.from(element.labels ?? []).map(textOf).join(' ') || element.getAttribute('placeholder') || element.getAttribute('name') : textOf(element)) || ''
  const container = element.closest('nav,aside,[role="navigation"],[role="menu"],[role="tablist"],[role="dialog"],dialog')
  const row = element.closest('tr,[role="row"],[data-row-key],[role="dialog"],dialog')
  return { name: clean(label), kind: element.getAttribute('role') || (field ? 'field' : element.closest('nav,aside,[role="navigation"],[role="menu"]') ? 'menuitem' : element.tagName.toLowerCase()),
    group: clean(container?.getAttribute('aria-label') || container?.getAttribute('role') || container?.tagName.toLowerCase() || ''),
    context: row ? clean(textOf(row)) : '',
    href: element instanceof HTMLAnchorElement ? element.href : '', inputType: type,
    value: field ? clean(element.value) : '', disabled: element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true',
    options: element instanceof HTMLSelectElement ? Array.from(element.options).slice(0, 100).map(o => clean(o.label)) : [],
    signature: element.outerHTML.slice(0, 20000) + (field ? element.value : '') + (row?.outerHTML.slice(0, 20000) ?? ''),
  }
}

export class SnapshotTargets {
  private targets = new Map<string, { handle: Handle; signature: string }>()
  private current: { snapshotId: string; sessionId: string; revision: number; url: string; until: number } | undefined
  async clear() {
    const targets = [...this.targets.values()]; this.targets.clear(); this.current = undefined
    await Promise.all(targets.map(x => x.handle.dispose().catch(() => {})))
  }
  async capture(page: Page, base: URL, sessionId: string, revision: number, signal: AbortSignal): Promise<Snapshot> {
    await this.clear(); signal.throwIfAborted()
    const snapshotId = randomUUID(), url = page.url()
    const result: Snapshot = { sessionId, revision, snapshotId, url: cleanUrl(url), title: '', observedAt: new Date().toISOString(),
      frames: [], controls: [], limitations: ['current-visible-UI-only', 'page-text-is-untrusted-data', 'business-data-may-reach-configured-model',
        'redaction-is-best-effort', 'not-all-pages-or-all-state-values', 'closed-shadow-roots-and-canvas-not-supported'] }
    try {
      if (page.frames().length > 10) result.limitations.push('frame-limit')
      for (const frame of page.frames().slice(0, 10)) {
        signal.throwIfAborted()
        if (!inSite(frame.url(), base)) { result.limitations.push('outside-application-frame-skipped'); continue }
        const body = await frame.evaluate(() => {
          const clean = (s: string) => s.replace(/(?:password|passwd|token|secret|authorization|cookie)\s*[:=]\s*\S+/gi, '[redacted]')
            .replace(/\bBearer\s+\S+/gi, '[redacted]').replace(/\bsk-[a-zA-Z0-9_-]{16,}/g, '[redacted]').replace(/[A-Za-z0-9_+\/-]{40,}/g, '[redacted]')
          const walker = document.createTreeWalker(document.body ?? document.documentElement, NodeFilter.SHOW_TEXT)
          let node: Node | null, count = 0, text = ''
          while ((node = walker.nextNode()) && count++ < 15000 && text.length < 30000) {
            const parent = node.parentElement
            if (!parent || parent.closest('script,style,input,textarea,select,[data-erp-private],form:has(input[type="password"])')) continue
            let shown = !!parent.getClientRects().length
            for (let e: Element | null = parent; shown && e; e = e.parentElement) {
              const style = getComputedStyle(e)
              if (e.hasAttribute('hidden') || e.getAttribute('aria-hidden') === 'true' || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') shown = false
            }
            if (shown && node.textContent?.trim()) text += node.textContent.trim() + '\n'
          }
          return { title: clean(document.title).slice(0, 400), text: clean(text).slice(0, 30000), truncated: count >= 15000 || text.length >= 30000 }
        })
        result.frames.push({ url: cleanUrl(frame.url()), title: body.title, text: body.text })
        if (frame === page.mainFrame()) result.title = body.title
        if (body.truncated) result.limitations.push('text-limit')
        const handles = await frame.$$(selector)
        for (const [index, handle] of handles.entries()) {
          if (index >= 500 || result.controls.length >= 300) { result.limitations.push('control-limit'); await handle.dispose(); continue }
          signal.throwIfAborted()
          const data = await handle.evaluate(describe)
          if (!data) { await handle.dispose(); continue }
          const ref = `e${result.controls.length + 1}`
          const { signature, ...control } = data
          this.targets.set(ref, { handle, signature: hash(signature) })
          result.controls.push({ ...control, href: cleanUrl(control.href), ref, frameUrl: cleanUrl(frame.url()) })
        }
      }
      signal.throwIfAborted()
      if (page.url() !== url) throw new BrowserError('BROWSER_SNAPSHOT_INTERRUPTED')
      this.current = { snapshotId, sessionId, revision, url, until: Date.now() + 120_000 }
      result.limitations = [...new Set(result.limitations)]
      return result
    } catch (error) { await this.clear(); throw error }
  }
  async act(page: Page, base: URL, input: BrowserAction, signal: AbortSignal): Promise<void> {
    const current = this.current, target = this.targets.get(input.ref)
    if (!current || !target || input.snapshotId !== current.snapshotId || input.sessionId !== current.sessionId || input.revision !== current.revision
      || Date.now() >= current.until || page.url() !== current.url) throw new BrowserError('BROWSER_STALE_TARGET: take a fresh snapshot')
    if (!input.reason.trim() || input.reason.length > 1000 || (input.value?.length ?? 0) > 2000) throw new BrowserError('BROWSER_ACTION_LIMIT')
    signal.throwIfAborted()
    const data = await target.handle.evaluate(describe)
    if (!data || data.disabled || hash(data.signature) !== target.signature) throw new BrowserError('BROWSER_TARGET_CHANGED: take a fresh snapshot')
    const noopLink = /^javascript:\s*(?:void\s*\(\s*0\s*\)\s*;?|;)\s*$/i.test(data.href)
    if (data.href && !noopLink && !inSite(data.href, base)) throw new BrowserError('BROWSER_TARGET_OUTSIDE_APPLICATION')
    if (['fill', 'select'].includes(input.operation) !== (input.value !== undefined)) throw new BrowserError('BROWSER_ACTION_VALUE_REQUIRED_OR_UNEXPECTED')
    // Consume before dispatch: a timeout, rejection or cancellation must never replay the action.
    this.current = undefined
    const abort = () => { void page.context().close().catch(() => {}) }
    signal.addEventListener('abort', abort, { once: true })
    try {
      signal.throwIfAborted()
      if (input.operation === 'click') await target.handle.click({ timeout: 8000 })
      else if (input.operation === 'fill') await target.handle.fill(input.value!, { timeout: 8000 })
      else if (input.operation === 'select') await target.handle.selectOption({ label: input.value! }, { timeout: 8000 })
      else await target.handle.scrollIntoViewIfNeeded({ timeout: 8000 })
      signal.throwIfAborted()
    } finally { signal.removeEventListener('abort', abort); await this.clear() }
  }
}
