import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { markdown, openUiHost, presentTitle } from '../present.js'
import { scopeSchema } from '../storage/contract.js'
import type { StorageClient } from '../storage/client.js'
import { startExplore } from './explore.js'
import { LearningRuntime } from './runtime.js'
import type { ExplorationView } from './runtime.js'
import { importSnapshot } from './snapshot-import.js'
const str = { type: 'string', required: true } as const
const scope = { ...scopeSchema, required: true } as const
const id = { scope, id: str }
function lines(view: ExplorationView | null): string[] {
  if (!view) return ['No exploration round is stored for this id.']
  const next = view.next
    ? `Next is ${view.next.label} at level ${view.next.level}${view.next.requiresApproval ? ', and opening that page needs approval' : ', from the snapshot already saved'}.`
    : `Level ${view.coverage.level} is ${view.state}.`
  return [next, `${view.summaries.length} level summaries are stored. Depth stops at 3.`]
}
export function registerLearningTools(ctx: Context, storage: StorageClient) {
  const runtime = new LearningRuntime(storage)
  const openui = () => openUiHost(ctx)
  const output = (title: string) => ({ schema: { type: 'json' as const },
    render: (_args: unknown, value: unknown) => markdown(title, lines(value as ExplorationView | null), value, openui()) })
  ctx.tools.register(defineTool({ name: 'erp_learning_import_snapshot',
    description: 'Build menu/page/control/field leaves from a saved browser-learning-v1 snapshot. Preserve evidence, observed select values (completeness unknown), and user corrections. Repeated import is idempotent. This does not choose the exploration frontier; erp_learning_begin owns that queue. Does not infer a complete menu hierarchy or business domains.',
    parameters: { scope, observationId: str },
    output: { schema: { type: 'json' }, render: (_args, value) => markdown('Snapshot leaves', ['Visible structure was saved as evidence-backed leaves. The controller still owns the frontier.'], value, openui()) },
    presentResult: presentTitle('Snapshot leaves'),
    execute: (args, exec) => importSnapshot(storage, args.scope, args.observationId, exec.signal),
  }))
  ctx.tools.register(defineTool({ name: 'erp_explore',
    description: 'Start exploring the bound ERP with the controller-owned depth-3 walk (erp_learning_begin). The round is stored immediately. If no logged-in page is visible, or observationId is a login form, the round pauses and is not marked complete. Pass observationId only after erp_native_observation_save or a managed snapshot of the signed-in page. This does not grant a browser action or an ERP write, and it does not start a second explorer.',
    parameters: { scope, observationId: { type: 'string' } },
    output: output('Exploration'), presentResult: presentTitle('Exploration'),
    execute: async (args, exec) => {
      if (!args.observationId) {
        const view = await startExplore(runtime, args.scope, exec.signal)
        return { ...view, note: view.pausedUntilLogin
          ? 'Paused: the logged-in page is not visible. Unfinished scope stays unfinished.'
          : 'This round is not complete ERP coverage.' }
      }
      const observation = await storage.call('observation', { scope: args.scope, id: args.observationId }, exec.signal)
      if (!observation) throw new Error('UI_OBSERVATION_REQUIRED')
      const view = await startExplore(runtime, args.scope, exec.signal, { id: observation.id, text: observation.text })
      const note = view.pausedUntilLogin
        ? 'Paused on a login page. The snapshot was not indexed. Unfinished scope stays unfinished.'
        : view.complete
          ? 'This round\'s frontier is finished. Coverage describes this round only.'
          : 'This round is not complete.'
      return { ...view, note }
    },
  }))
  ctx.tools.register(defineTool({ name: 'erp_learning_begin',
    description: 'Start a controller-owned breadth-first exploration round. The frontier begins at one entry snapshot. Do not supply units. Depth stops at 3: entry snapshot, then approved page opens, then visible fields, tabs and windows. After each level the controller writes one summary before the next level. No browser permission is created.',
    parameters: id, output: output('Exploration'), presentResult: presentTitle('Exploration'),
    execute: (args, exec) => runtime.begin(args.scope, args.id, exec.signal) }))
  ctx.tools.register(defineTool({ name: 'erp_learning_status',
    description: 'Return the controller-owned next step, durable revision, coverage and level summaries. An ended round can contain blocked steps. Never describe it as complete ERP coverage. Depth stops at 3.',
    parameters: id, output: output('Exploration'), presentResult: presentTitle('Exploration'),
    execute: (args, exec) => runtime.status(args.scope, args.id, exec.signal) }))
  ctx.tools.register(defineTool({ name: 'erp_learning_accept',
    description: 'Give the controller the saved browser-learning-v1 observation for its current step. The controller imports leaves, and when the level is finished it writes the summary and opens the next level. Level 1 can be the entry snapshot. Opening a later page still needs a separate approval. Do not send a unit id.',
    parameters: { ...id, expectedVersion: { type: 'integer', required: true }, observationId: str },
    output: output('Exploration step'), presentResult: presentTitle('Exploration step'),
    execute: (args, exec) => runtime.accept(args.scope, args.id, args.expectedVersion, args.observationId, exec.signal) }))
  ctx.tools.register(defineTool({ name: 'erp_learning_block',
    description: 'Block only the controller current step with a concrete reason. No observation is required. The controller then continues or writes the level summary. This does not grant a browser action.',
    parameters: { ...id, expectedVersion: { type: 'integer', required: true }, reason: str },
    output: output('Exploration step'), presentResult: presentTitle('Exploration step'),
    execute: (args, exec) => runtime.block(args.scope, args.id, args.expectedVersion, args.reason, exec.signal) }))
  ctx.tools.register(defineTool({ name: 'erp_learning_pause',
    description: 'Pause or explicitly resume a controller-owned round by its exact version. Does not restore a browser grant or replay actions.',
    parameters: { ...id, expectedVersion: { type: 'integer', required: true }, resume: { type: 'boolean', required: true } },
    output: output('Exploration'), presentResult: presentTitle('Exploration'),
    execute: (args, exec) => runtime.pause(args.scope, args.id, args.expectedVersion, args.resume, exec.signal) }))
}
