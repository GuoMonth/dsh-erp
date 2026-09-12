import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { StorageClient } from '../storage/client.js'
import type { Input } from '../storage/contract.js'
import type { KnowledgeView } from './contract.js'
import { privateDirectory } from '../storage/paths.js'

const escape = (text: string) => text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/[\\`*_{}[\]()#+.!|]/g,'\\$&').replace(/\r?\n/g,' ')
/** Generated local views; SQLite revisions remain authoritative. Never accepts a destination path. */
export async function exportKnowledge(storage: StorageClient, scope: Input<'knowledgeSearch'>['scope'], signal: AbortSignal) {
  const items: KnowledgeView[] = []
  let after = '', truncated = false
  do {
    const page = await storage.call('knowledgeSearch', { scope, query: '', after, limit: 50 }, signal)
    items.push(...page.items)
    after = page.hasMore ? page.nextAfter : ''
    if (items.length >= 2000 && after) { truncated = true; break }
  } while (after)
  signal.throwIfAborted()
  const id = randomUUID(), directory = privateDirectory(join(storage.directory,'exports'))
  const jsonPath = join(directory,`${id}.json`), markdownPath = join(directory,`${id}.md`)
  const limitations = ['Current scoped knowledge projection, not a backup or all revision history', 'Pages may reflect concurrent local updates; inspect record versions', ...(truncated ? ['Record limit reached (2000); export is partial'] : []), 'Confirmations may be truncated per record; query verifications for full history']
  const projection = { format: 1, scope, generatedAt: new Date().toISOString(), limitations, items }
  const lines = ['# ERP knowledge', '', `Scope: ${escape(JSON.stringify(scope))}`, '', ...limitations.map(x=>`- ${escape(x)}`), '']
  for (const {record:r, staleDependencies} of items) {
    lines.push(`## ${escape(r.name)}`, '', `ID: ${escape(r.id)} · ${r.kind} · v${r.version} · ${r.stage} · ${r.lifecycle}`, '', escape(r.description), '', `Flags: ${escape(r.flags.join(', ')||'none')}; stale dependencies: ${staleDependencies.length}`, '')
    if (r.context?.url) lines.push(`Entry: ${escape(r.context.url)}`, '')
    if (r.from && r.to) lines.push(`${escape(r.from.id)} v${r.from.version} → ${r.predicate} → ${escape(r.to.id)} v${r.to.version}`, '')
    for (const evidence of r.evidence) lines.push(`- ${escape(evidence.observationId)}: ${escape(evidence.quote)}`)
    lines.push('')
  }
  writeFileSync(jsonPath, JSON.stringify(projection,null,2), { mode:0o600, flag:'wx' })
  writeFileSync(markdownPath, lines.join('\n'), { mode:0o600, flag:'wx' })
  return { jsonPath, markdownPath, records: items.length, truncated, limitations }
}
