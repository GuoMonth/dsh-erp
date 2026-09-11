import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { assertRuntime, DSH_TARGET } from './runtime-version.js'
import { healthSchema } from './protocol.js'
import { WorkerClient } from './worker-client.js'
import type { RuntimeEvent } from './worker-client.js'

export const name = 'dsh-erp'
export const inject = ['tools', 'llm']

declare module '@deepseek-ai/cordis' {
  interface Context { erp: ErpRuntime }
}

export class ErpRuntime extends Service {
  readonly worker: WorkerClient
  readonly lifetime = new AbortController()
  private events: RuntimeEvent[] = []
  private modelCalls = 0
  private modelDurationMs = 0
  private inputTokens = 0
  private outputTokens = 0
  private readonly modelTasks = new Set<Promise<unknown>>()

  constructor(ctx: Context) {
    super(ctx, 'erp')
    this.worker = new WorkerClient({ onEvent: event => {
      this.events.push(event)
      if (this.events.length > 100) this.events.shift()
    } })
    ctx.effect(() => () => this.stop())
  }

  diagnostics() {
    return { dsh: DSH_TARGET, modelCalls: this.modelCalls, modelDurationMs: this.modelDurationMs,
      inputTokens: this.inputTokens, outputTokens: this.outputTokens,
      events: this.events.map(event => ({ ...event })) }
  }

  async modelProbe(provider: string, model: string, signal: AbortSignal): Promise<string> {
    const combined = AbortSignal.any([signal, this.lifetime.signal, AbortSignal.timeout(30_000)])
    const run = async () => {
      combined.throwIfAborted()
      const started = performance.now()
      this.modelCalls++
      try {
        let text = ''
        let finished = false
        for await (const chunk of this.ctx.llm.stream({ provider, model, signal: combined,
          messages: [createUserMessage({
            source: { kind: 'plugin', plugin: name, form: 'notice', summary: 'ERP model connection probe' },
            content: [{ type: 'text', text: 'Reply with exactly ERP_MODEL_OK. This is a connection test with no business data.' }],
          })],
          maxTokens: 64,
        })) {
          combined.throwIfAborted()
          if (chunk.type === 'text-delta') text += chunk.text
          if (chunk.type === 'usage') {
            this.inputTokens += chunk.usage.inputTokens
            this.outputTokens += chunk.usage.outputTokens
          }
          if (text.length > 4096) throw new Error('MODEL_PROBE_OUTPUT_LIMIT')
          if (chunk.type === 'finish') {
            if (chunk.reason.kind !== 'stop') throw new Error(`MODEL_PROBE_${chunk.reason.kind.toUpperCase()}`)
            finished = true
          }
        }
        combined.throwIfAborted()
        if (!finished || text.trim() !== 'ERP_MODEL_OK') throw new Error('MODEL_PROBE_UNEXPECTED_RESPONSE')
        return 'ERP_MODEL_OK'
      } finally { this.modelDurationMs += Math.round(performance.now() - started) }
    }
    const task = run()
    this.modelTasks.add(task)
    try { return await task } finally { this.modelTasks.delete(task) }
  }

  private async stop(): Promise<void> {
    this.lifetime.abort()
    await Promise.all([this.worker.dispose(), ...[...this.modelTasks].map(task => task.catch(() => {}))])
  }
}

export function apply(ctx: Context): void {
  assertRuntime()
  const runtime = new ErpRuntime(ctx)
  ctx.tools.register(defineTool({
    name: 'erp_runtime_status',
    description: 'Check the local ERP worker connection. Diagnostic only; does not open or modify an ERP.',
    parameters: {},
    output: { schema: healthSchema, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(_args, exec) {
      return runtime.worker.health(AbortSignal.any([exec.signal, runtime.lifetime.signal]))
    },
  }))
  ctx.tools.register(defineTool({
    name: 'erp_model_probe',
    description: 'Run a fixed connection test through an already configured dsh provider/model. May consume model tokens; sends no ERP data. Use only when requested for diagnostics.',
    parameters: {
      provider: { type: 'string', required: true, description: 'Existing dsh provider route' },
      model: { type: 'string', required: true, description: 'Model served by that provider' },
    },
    output: { schema: { type: 'string' }, render: (_args, text) => [{ type: 'text', text }] },
    async execute(args, exec) { return runtime.modelProbe(args.provider, args.model, exec.signal) },
  }))
  // This no-op proves the host's ask seam only. Business authorization is Issue #7.
  ctx.on('tools/pre-execute', async (exec, next) => {
    if (exec.name === 'erp_approval_probe') return { kind: 'ask', reason: 'ERP approval connection test only; no ERP business data will change.' }
    return next()
  })
  ctx.tools.register(defineTool({
    name: 'erp_approval_probe',
    description: 'Test the dsh approval channel with an explicit no-op confirmation. Does not authorize any future ERP operation.',
    parameters: {},
    output: { schema: { type: 'string' }, render: (_args, text) => [{ type: 'text', text }] },
    async execute(_args, exec) { exec.signal.throwIfAborted(); return 'Approval channel answered; no business operation performed.' },
  }))
}
