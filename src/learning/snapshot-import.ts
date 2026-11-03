import { createHash } from 'node:crypto'
import { validateJsonSchemaValue, valueSchemaSpecToJsonSchema } from '../schema-runtime.js'
import { snapshotSchema } from '../browser/snapshot.js'
import type { Snapshot } from '../browser/snapshot.js'
import type { StorageClient } from '../storage/client.js'
import type { Scope } from '../storage/primitives.js'
import type { KnowledgeWrite } from '../knowledge/contract.js'

const key = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 24)
export function isMenuControl(control: { kind: string; group: string }): boolean {
  return ['menuitem', 'treeitem'].includes(control.kind) || ['nav', 'aside', 'navigation', 'menu'].includes(control.group)
}
export function controlKey(snapshotUrl: string, control: { frameUrl: string; group: string; href: string; name: string; kind: string }): string {
  const identity = isMenuControl(control)
    ? `${new URL(control.frameUrl).origin}:${control.group}:${control.href || control.name}`
    : `${snapshotUrl}:${control.frameUrl}:${control.group}:${control.kind}:${control.name}`
  return key(identity)
}
export function parseSnapshot(text: string): Snapshot {
  let snapshot: unknown
  try { snapshot = JSON.parse(text) } catch { throw new Error('UI_OBSERVATION_SHAPE') }
  if (validateJsonSchemaValue(valueSchemaSpecToJsonSchema(snapshotSchema), snapshot, '').length) throw new Error('UI_OBSERVATION_SHAPE')
  return snapshot as Snapshot
}
export async function importSnapshot(storage: StorageClient, scope: Scope, observationId: string, signal: AbortSignal) {
  const observation = await storage.call('observation', { scope, id: observationId }, signal)
  let source = ''
  try { source = JSON.parse(observation?.context ?? '').source } catch { source = '' }
  if (!observation || source !== 'browser-learning-v1') throw new Error('UI_OBSERVATION_REQUIRED')
  const snapshot = parseSnapshot(observation.text)
  const ids: string[] = [], menuIds: string[] = []
  const put = async (input: Omit<KnowledgeWrite, 'expectedVersion'>) => {
    const previous = await storage.call('knowledgeGet', { scope, id: input.id }, signal)
    ids.push(input.id)
    // The structural importer must not replace user corrections or a richer AI interpretation.
    if (previous?.record.origin === 'user' || previous?.record.stage === 'interpreted' || previous?.record.evidence.some(e => e.observationId === observationId)) return { id: input.id, version: previous.record.version }
    const [record] = await storage.call('knowledgeCommit', { scope, origin: 'ai', records: [{ ...input, expectedVersion: previous?.record.version ?? 0 }] }, signal)
    return { id: input.id, version: record!.version }
  }
  const common = (quote: string) => ({ aliases: [], description: 'Observed UI structure; business meaning and behavior require interpretation and evidence.',
    stage: 'observed' as const, flags: ['needs-review' as const], lifecycle: 'active' as const,
    evidence: [{ observationId, quote: JSON.stringify(quote) }], dependencies: [] })
  const pageId = 'ui-page-' + key(snapshot.url)
  const page = await put({ ...common(snapshot.url), id: pageId, name: snapshot.title || snapshot.url, kind: 'page', context: { url: snapshot.url, pageType: 'observed-ui' } })
  let unnamed = 0
  for (const c of snapshot.controls) {
    signal.throwIfAborted()
    if (!c.name) { unnamed++; continue }
    const menu = isMenuControl(c)
    const kind = menu ? 'menu' : c.kind === 'tab' ? 'tab' : c.kind === 'window' ? 'window' : 'control'
    const id = `ui-${kind}-` + controlKey(snapshot.url, c)
    const node = await put({ ...common(c.name), id, kind, name: c.name, context: { url: c.frameUrl, detail: `Visible ${c.kind}; group ${c.group || 'page'}. Target refs are temporary, not reusable commands.` } })
    if (menu) menuIds.push(id)
    else {
      await put({ ...common(c.name), id: 'ui-edge-' + key(pageId + id), name: 'contains', kind: 'relation', from: page, to: node, predicate: 'contains' })
      if (c.kind === 'field') {
        const fieldKey = controlKey(snapshot.url, c)
        const field = await put({ ...common(c.name), id: 'ui-field-' + fieldKey, kind: 'field', name: c.name,
          definition: { valueType: 'string', observedValues: [...new Set([...c.options, ...(c.value ? [c.value] : [])])].slice(0, 100), completeness: 'unknown' } })
        await put({ ...common(c.name), id: 'ui-field-edge-' + fieldKey, kind: 'relation', name: 'represents', from: node, to: field, predicate: 'represents' })
      }
    }
  }
  return { scope, observationId, pageId, menuIds: [...new Set(menuIds)], records: new Set(ids).size, unnamed,
    limitations: ['Visible structure only; menu nesting must be established from further evidence', 'Does not infer business domains, completed navigation, hidden states or absence of retired controls', 'Repeated row controls may share a structural identity; use page/window context when interpreting', 'Use erp_knowledge_record to link domains and record learned methods; fresh snapshots are required before execution'] }
}
