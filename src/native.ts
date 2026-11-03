import type { Context } from '@deepseek-ai/cordis'
import * as Erp from './index.js'

export { Config } from './index.js'
export const name = 'dsh-erp-native'
export const inject = ['tools', 'llm', 'agents', 'systemPrompt']

/** Same product entry as the package root. Native browser providers load unless browserMode is managed. */
export async function apply(ctx: Context, config: Erp.Config = {}): Promise<void> {
  await Erp.apply(ctx, config)
}
