import type { Context } from '@deepseek-ai/cordis'
import type { Config } from './index.js'

/** Official Browser Use, or Playwright MCP when the host has not provided one. */
export async function loadNativeProviders(ctx: Context, config: Config): Promise<void> {
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
