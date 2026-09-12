import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { scopeSchema } from '../storage/contract.js'
import type { StorageClient } from '../storage/client.js'
import { LearningRuntime } from './runtime.js'
const str = { type: 'string', required: true } as const
const scope = { ...scopeSchema, required: true } as const
const id = { scope, id: str }
const render = (_args: unknown, value: unknown) => [{ type: 'text' as const, text: JSON.stringify(value) }]
const output = { schema: { type: 'json' as const }, render }
export function registerLearningTools(ctx: Context, storage: StorageClient) {
  const runtime = new LearningRuntime(storage)
  ctx.tools.register(defineTool({ name: 'erp_learning_import_menu', description: 'Materialize a saved SCM menu observation into versioned menu nodes and contains edges. Records discovery, not visited pages or inferred business domains. Use erp_knowledge_record afterward for evidence-backed domains and relations. Returns local graph IDs; does not call ERP.', parameters: { scope, observationId: str }, output,
    execute: async (a,e) => { const { menuIds: _ids, ...summary } = await runtime.importMenu(a.scope,a.observationId,e.signal); return summary } }))
  ctx.tools.register(defineTool({ name: 'erp_learning_start', description: 'Persist a finite breadth-first learning round. Provide explicit tasks: level1 global structure, level2 functional pages, level3 fields/tabs/windows, level4 behavior. Lower levels always settle before higher levels. No browser actions or permissions are created. ID must be new; use status to resume.', parameters: { ...id, units: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: { id: str, level: { type: 'integer', required: true }, label: str } } } }, output,
    execute: (a,e) => runtime.start(a.scope,a.id,a.units,e.signal) }))
  ctx.tools.register(defineTool({ name: 'erp_learning_status', description: 'Return next pending unit, durable revision, coverage and recorded gaps. Ended rounds may contain blocked units; never describe that as complete ERP coverage.', parameters: id, output,
    execute: (a,e) => runtime.status(a.scope,a.id,e.signal) }))
  ctx.tools.register(defineTool({ name: 'erp_learning_finish_unit', description: 'Settle ONLY the current next unit using exact checkpoint version. observed requires saved same-scope evidence; blocked requires a concrete reason. Evidence existence is checked, semantic correctness still needs review. No automatic browser action replay.', parameters: { ...id, expectedVersion: { type: 'integer', required: true }, unitId: str, outcome: { type: 'string', enum: ['observed','blocked'], required: true }, observationIds: { type: 'array', items: { type: 'string' }, required: true }, reason: str }, output,
    execute: (a,e) => runtime.finish(a.scope,a.id,a.expectedVersion,a.unitId,a.outcome,a.observationIds,a.reason,e.signal) }))
  ctx.tools.register(defineTool({ name: 'erp_learning_pause', description: 'Pause or explicitly resume a durable learning round by exact version; does not restore a browser grant or replay actions.', parameters: { ...id, expectedVersion: { type: 'integer', required: true }, resume: { type: 'boolean', required: true } }, output,
    execute: (a,e) => runtime.pause(a.scope,a.id,a.expectedVersion,a.resume,e.signal) }))
}
