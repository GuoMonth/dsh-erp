import { chromium } from 'playwright'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { BrowserError } from './contract.js'
import { privateDirectory } from '../storage/paths.js'

/** Use Playwright's pinned browser installer, never a page/model-provided command. */
export type BrowserProgress = (phase: 'preparing' | 'downloading' | 'launching' | 'ready', percent: number) => void
export async function prepareBrowser(signal: AbortSignal, progress: BrowserProgress = () => {}): Promise<void> {
  signal.throwIfAborted()
  progress('preparing', 0)
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) privateDirectory(process.env.PLAYWRIGHT_BROWSERS_PATH)
  if (existsSync(chromium.executablePath())) return
  const directory = process.env.PLAYWRIGHT_BROWSERS_PATH
  if (!directory) throw new BrowserError('BROWSER_RESOURCE_DIRECTORY_REQUIRED')
  privateDirectory(directory)
  const cli = join(dirname(createRequire(import.meta.url).resolve('playwright/package.json')), 'cli.js')
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [cli, 'install', 'chromium', '--no-shell'], {
      env: { ...process.env, PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT: '30000' }, stdio: ['ignore', 'pipe', 'ignore'],
    })
    let percent = -1
    child.stdout.on('data', (chunk: Buffer) => {
      for (const match of chunk.toString().matchAll(/(\d{1,3})%/g)) {
        const next = Math.min(100, Number(match[1]))
        if (next !== percent) { percent = next; progress('downloading', percent) }
      }
    })
    let force: ReturnType<typeof setTimeout> | undefined
    const cancel = () => { child.kill('SIGTERM'); force ??= setTimeout(() => child.kill('SIGKILL'), 1000) }
    const timeout = setTimeout(cancel, 600_000)
    signal.addEventListener('abort', cancel, { once: true })
    child.once('error', () => { /* close follows error and settles cleanup */ })
    child.once('close', code => {
      clearTimeout(timeout); clearTimeout(force); signal.removeEventListener('abort', cancel)
      if (signal.aborted) reject(new BrowserError('CANCELLED'))
      else if (code !== 0 || !existsSync(chromium.executablePath())) reject(new BrowserError('BROWSER_INSTALL_FAILED_RETRY'))
      else resolve()
    })
    if (signal.aborted) cancel()
  })
}
