import type { Context } from '@deepseek-ai/cordis'
import * as Erp from './index.js'
import { join } from 'node:path'
import { z } from 'zod'

export { Config } from './index.js'
export const name = 'dsh-erp-native'
export const inject = ['tools', 'llm', 'agents', 'systemPrompt', ...(process.env.DESKWORK_HOST === '1' ? ['browserUse', 'deskworkBrowser'] : [])]

/** Deskwork publishes site identity; the ERP consumer owns its business configuration and storage. */
export function deskworkConfig(config: Erp.Config, environment: NodeJS.ProcessEnv): Erp.Config {
  if (environment.DESKWORK_HOST !== '1') return config
  const raw: unknown = JSON.parse(environment.DESKWORK_SITE_CONTEXT ?? 'null')
  if (raw === null) return config
  const site = z.object({ id: z.string().min(1), name: z.string().min(1), url: z.url().refine((value) => { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password }) }).strict().parse(raw)
  const directory = z.string().min(1).parse(environment.DESKWORK_DATA_DIRECTORY)
  return { ...config, system: config.system ?? { url: site.url, baseUrl: new URL('.', site.url).href, name: site.name, account: site.id }, dataDir: config.dataDir ?? join(directory, 'plugins', 'erp') }
}

/** Standard DSH plugin composition: reuse an existing browser provider or load the official one. */
export async function apply(ctx: Context, config: Erp.Config = {}): Promise<void> {
  if (config.browserMode === 'managed') { Erp.apply(ctx, config); return }
  Erp.apply(ctx, { ...deskworkConfig(config, process.env), browserMode: 'native' })
  if (!ctx.get('browserUse')) {
    const { default: BrowserUse } = await import('@deepseek-ai/dsh-browser-use')
    await ctx.plugin(BrowserUse)
  }
  if (!ctx.get('browserUse')?.providerName) {
    const PlaywrightProvider = await import('@deepseek-ai/dsh-experimental-browser-use-playwright-mcp')
    await ctx.plugin(PlaywrightProvider, config.browserEndpoint
    ? { mode: 'attach', endpoint: config.browserEndpoint }
    : { mode: 'launch', headless: config.browserHeadless ?? false,
      ...(config.browserExecutablePath ? { executablePath: config.browserExecutablePath } : {}) })
  }
  if (config.computerUse) {
    const [{ default: ComputerUse }, NativeComputer] = await Promise.all([
      import('@deepseek-ai/dsh-computer-use'), import('@deepseek-ai/dsh-experimental-computer-use-cua-driver-native'),
    ])
    if (!ctx.get('computerUse')) await ctx.plugin(ComputerUse)
    if (!ctx.get('computerUse')?.providerName) await ctx.plugin(NativeComputer)
  }
}
