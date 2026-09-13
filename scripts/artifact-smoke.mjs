import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, readFileSync, writeFileSync, cpSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, delimiter, dirname } from 'node:path'
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('..', import.meta.url))
const scratch = mkdtempSync(join(tmpdir(), 'dsh-erp-artifact-'))
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
function run(command, args, options = {}) {
  try { return execFileSync(command, args, { encoding: 'utf8', timeout: 180_000, ...options }) }
  catch (error) { throw new Error(`Artifact command failed: ${command} ${args.join(' ')}\n${error.stdout ?? ''}\n${error.stderr ?? ''}`) }
}
let siteProcess
try {
  const packed = JSON.parse(run(npm, ['pack', '--ignore-scripts', '--json', '--pack-destination', scratch], { cwd: root }))[0]
  const names = packed.files.map(f => f.path)
  assert.ok(!names.some(n => /^(dist\/scm|docs\/(testing|assessments)|tests|artifacts)\//.test(n) || /(?:^|\/)(?:store\.sqlite|browser-profiles|evidence|exports)(?:[/.]|$)/.test(n)), 'Do not publish site adapters, benchmark data or user knowledge')
  assert.ok(names.includes('dist/browser/snapshot.js'))
  assert.ok(names.includes('docs/adaptive-learning.md'))
  assert.deepEqual(names.filter(name => /^readme(?:$|\.)/i.test(name)), ['README.md'], 'npm must have one root README to select')
  assert.ok(names.includes('docs/README.zh-CN.md'), 'Ship the Simplified Chinese guide')
  assert.ok(names.includes('docs/system-configuration.md'), 'Ship configuration and upgrade instructions')
  assert.ok(names.includes('dist/system.js'), 'Ship system identity runtime')
  for (const file of ['dist/index.js', 'dist/worker.js', 'dist/storage/worker.js', 'dist/storage/database.js', 'dist/knowledge/store.js', 'dist/knowledge/tools.js', 'dist/knowledge/export.js', 'dist/knowledge/migration.js', 'dist/browser/session.js', 'dist/browser/resources.js', 'dist/browser/labels.js', 'dist/browser/read-policy.js', 'dist/browser/read-navigation.js', 'dist/learning/runtime.js', 'dist/learning/tools.js', 'cordis.patch.yml']) assert.ok(names.includes(file), file)
  assert.ok(!names.some(n => n.startsWith('tests/') || n.startsWith('scripts/') || n.endsWith('.ts') && !n.endsWith('.d.ts')))
  const consumer = join(scratch, 'consumer'); mkdirSync(consumer)
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
  run(npm, ['install', '--ignore-scripts', '--no-audit', '--no-fund', join(scratch, packed.filename),
    '@deepseek-ai/dsh-system-prompt@0.1.5-rc.2', '@deepseek-ai/dsh-user-approval@0.1.5-rc.2'], { cwd: consumer })
  cpSync(join(root, 'tests/harness.mjs'), join(consumer, 'harness.mjs'))
  writeFileSync(join(consumer, 'run.mjs'), "import * as plugin from '@guosheng_047/dsh-erp'; import {exercise} from './harness.mjs'; console.log(JSON.stringify(await exercise(plugin)));\n")
  console.log('Installed tarball:', run(process.execPath, [join(consumer, 'run.mjs')], { cwd: consumer }).trim())

  siteProcess = spawn(process.execPath, [join(root, 'tests/fixtures/erp-site.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] })
  const [ready] = await once(siteProcess.stdout, 'data')
  const siteUrl = String(ready).trim() + '/suite/'
  assert.match(siteUrl, /^http:\/\/127\.0\.0\.1:\d+\/suite\/$/)
  const home = join(scratch, 'home'); mkdirSync(home)
  const env = { ...process.env, DSH_HOME: home, DSH_TOOLS_MODE: 'native',
    PATH: join(root, 'node_modules/.bin') + delimiter + process.env.PATH }
  // Test homes and a fixed test adapter prevent using any configured account/model.
  const cli = resolve(root, 'node_modules/@deepseek-ai/dsh/lib/bin.js')
  run(process.execPath, [cli, 'plugin', '--profile', 'headless', 'add', join(scratch, packed.filename)], { cwd: consumer, env })
  const manifest = JSON.parse(readFileSync(join(home, 'profiles/headless/package.json'), 'utf8'))
  assert.ok(manifest.dsh.profile.bundles.includes('@guosheng_047/dsh-erp'))
  cpSync(join(root, 'scripts/fixture-provider.mjs'), join(consumer, 'fixture-provider.mjs'))
  const patch = join(scratch, 'fixture.patch.yml')
  writeFileSync(patch, `- id: agent-default-model\n  config:\n    provider: erp-fixture\n    model: test-model\n- insert:\n    - id: erp-artifact-fixture\n      name: ${JSON.stringify(join(consumer, 'fixture-provider.mjs'))}\n`)
  // Exercise the persistent user configuration path documented in README, without a system --patch overlay.
  const userPatch = join(home, 'profiles/headless/cordis.patch.yml')
  const previousPatch = readFileSync(userPatch, 'utf8')
  writeFileSync(userPatch, (previousPatch.replace(/^\s*\[\]\s*$/m, '') + '\n') + `- id: erp\n  config:\n    system:\n      url: ${siteUrl}\n      account: reader\n    browserHeadless: true\n    browserSandbox: false\n    browserResourcesDir: ${JSON.stringify(dirname(dirname(dirname(chromium.executablePath()))))}\n`)
  const output = run(process.execPath, [cli, '--profile', 'headless', '--patch', patch, 'Verify ERP plugin diagnostics'], { cwd: consumer, env })
  const match = output.match(/ERP_HOST_SMOKE_OK worker=(\d+)/)
  assert.ok(match, output)
  assert.throws(() => process.kill(Number(match[1]), 0), { code: 'ESRCH' })
  console.log(`Real dsh rc2 CLI: plugin install, agent loop, IPC, model service, approval, SQLite, knowledge record/query, blank and connected Chromium sessions, generic UI learning and exit cleanup passed (${process.platform}/${process.arch}, Node ${process.versions.node}; deterministic test provider, browser sandbox disabled only for container fixture).`)
} finally {
  if (siteProcess && siteProcess.exitCode === null) { siteProcess.kill('SIGTERM'); await once(siteProcess, 'exit') }
  if (process.env.ERP_KEEP_SMOKE === '1') console.log('Smoke artifacts:', scratch)
  else rmSync(scratch, { recursive: true, force: true })
}
