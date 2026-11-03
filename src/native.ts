import type { Context } from '@deepseek-ai/cordis'
import * as Erp from './index.js'

export { Config } from './index.js'
export const name = 'dsh-erp-native'
export const inject = ['tools', 'llm', 'agents', 'systemPrompt']

/** Standard DSH plugin composition: reuse an existing browser provider or load the official one. */
export async function apply(ctx: Context, config: Erp.Config = {}): Promise<void> {
  if (config.browserMode === 'managed') { Erp.apply(ctx, config); return }
  Erp.apply(ctx, { ...config, browserMode: 'native' })
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
