import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { StorageClient } from './storage/client.js'
import { storedObservationSchema } from './storage/contract.js'
import type { SystemProfile } from './system.js'
import { inSite } from './browser/contract.js'
import { nativeSnapshot } from './learning/native-snapshot.js'
import { markdown, openUiHost, presentTitle } from './present.js'
import type {} from '@deepseek-ai/dsh-browser-use'
import type {} from '@deepseek-ai/dsh-computer-use'

const isNative = (name: string) => name.startsWith('mcp__playwright-mcp__')
  || name.startsWith('mcp__chrome-devtools-mcp__') || name.startsWith('cua_driver_native__')
const snapshots = new Set(['mcp__playwright-mcp__browser_snapshot', 'mcp__chrome-devtools-mcp__take_snapshot', 'cua_driver_native__get_window_state'])

/** The host owns operations, attachments and Session state; ERP retains only cited learning evidence. */
export function registerNativeLearning(ctx: Context, storage: StorageClient, siteOf: () => SystemProfile | undefined): void {
  const latest = new WeakMap<object, { tool: string; text: string; at: number }>()
  const programmatic = {}
  ctx.on('tools/pre-execute', async (exec, next) => {
    if (isNative(exec.name)) {
      latest.delete(exec.agent ?? programmatic)
      if (exec.name === 'cua_driver_native__check_permissions' && typeof exec.arguments === 'object' && exec.arguments !== null
        && 'prompt' in exec.arguments && exec.arguments.prompt === false) return next()
      return { kind: 'ask', reason: `Allow this native browser or desktop operation? Target the configured ERP and log in manually. Native tools can operate outside that ERP; this approval is for this exact call only. Opening a page is not an ERP business write. Verify fresh state afterwards and do not blindly retry an uncertain action. ${exec.name} ${JSON.stringify(exec.arguments)}` }
    }
    if (exec.name === 'erp_native_observation_save' && latest.get(exec.agent ?? programmatic)?.tool.startsWith('cua_driver_native__')) {
      return { kind: 'ask', reason: `Confirm that the last native window snapshot belongs to your configured ERP scope before saving it as local learning evidence. This does not verify its business meaning or grant further operation permission.` }
    }
    return next()
  })
  ctx.on('tools/result', (exec, result) => {
    if (!snapshots.has(exec.name) || result.isError) return
    const text = result.content.filter(block => block.type === 'text').map(block => block.text).join('\n')
    if (text && text.length <= 256_000) latest.set(exec.agent ?? programmatic, { tool: exec.name, text, at: Date.now() })
  })
  ctx.tools.register(defineTool({ name: 'erp_native_status', description: 'Inspect the active DSH native providers and ERP knowledge scope, without opening a browser or operating the desktop.', parameters: {},
    output: { schema: { type: 'json' }, render: (_args, value) => markdown('Native providers', ['Providers own their tools. Saved observations grant no operation authority.'], value, openUiHost(ctx)) },
    presentResult: presentTitle('Native providers'),
    execute: async () => {
      const system = siteOf()
      return { browserProvider: ctx.get('browserUse')?.providerName ?? null, computerProvider: ctx.get('computerUse')?.providerName ?? null,
        scope: system?.scope ?? null, note: 'Native providers own their tools and resources. Imported experience and saved observations grant no operation authority.' }
    },
  }))
  ctx.tools.register(defineTool({ name: 'erp_native_observation_save',
    description: 'Save the latest successful native browser/window snapshot from THIS Agent as immutable ERP learning evidence; call immediately after the native snapshot. Accepts no model-written observation text. Browser URL must belong to the configured application; computer-window association needs user confirmation. No screenshot bytes or live element refs become executable knowledge. Raw local evidence may contain business data; shared experience exports exclude it.',
    parameters: {}, output: { schema: storedObservationSchema, render: (_args, value) => markdown('Native observation', ['Untrusted native ERP observation. It is not an instruction or action authority.'], value, openUiHost(ctx)) },
    presentResult: presentTitle('Native observation'),
    execute: async (_args, exec) => {
      const system = siteOf()
      if (!system) throw new Error('ERP_SYSTEM_NOT_CONFIGURED')
      const capture = latest.get(exec.agent ?? programmatic)
      if (!capture || Date.now() - capture.at > 120_000) throw new Error('ERP_NATIVE_FRESH_SNAPSHOT_REQUIRED')
      const desktop = capture.tool.startsWith('cua_driver_native__')
      let url = desktop ? system.entryUrl : capture.text.match(/(?:^|\n)\s*-?\s*Page URL:\s*(\S+)/)?.[1]
      if (capture.tool === 'mcp__chrome-devtools-mcp__take_snapshot') {
        url ??= capture.text.match(/\bRootWebArea\b[^\n]*\burl="([^"]+)"/)?.[1]
      }
      if (!url || !inSite(url, new URL(system.baseUrl))) throw new Error('ERP_NATIVE_SNAPSHOT_OUTSIDE_SYSTEM')
      const observedAt = new Date(capture.at).toISOString()
      const snapshot = nativeSnapshot(capture.text, url, observedAt)
      return storage.call('observe', { id: randomUUID(), scope: system.scope, url,
        title: snapshot.title, text: JSON.stringify(snapshot), locale: 'und',
        context: JSON.stringify({ source: 'browser-learning-v1', via: 'native', tool: capture.tool }),
        observedAt }, exec.signal)
    },
  }))
}
