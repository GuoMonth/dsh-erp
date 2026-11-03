import { build } from 'esbuild'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
// Deleted adapters must not survive a local incremental build and enter a later npm tarball.
rmSync(new URL('../dist', import.meta.url), { recursive: true, force: true })
execFileSync(process.execPath, [fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url)), '-p', 'tsconfig.json'], { cwd: root, stdio: 'inherit' })

// DSH resolves peer packages inside its own process. Workers need these pure helpers on disk.
const bundled = await build({
  entryPoints: [fileURLToPath(new URL('../src/schema-runtime.ts', import.meta.url))],
  outfile: fileURLToPath(new URL('../dist/schema-runtime.js', import.meta.url)),
  bundle: true, platform: 'node', format: 'esm', target: 'node24', metafile: true,
})
// Preserve the notices for code embedded in the worker's schema module.
const packages = new Set(Object.values(bundled.metafile.outputs).flatMap(output =>
  Object.entries(output.inputs).filter(([, input]) => input.bytesInOutput > 0)
    .map(([path]) => path.match(/node_modules\/(@[^/]+\/[^/]+|[^/]+)/)?.[1]).filter(Boolean)))
const notices = [...packages].sort().map(name => {
  const directory = new URL(`../node_modules/${name}/`, import.meta.url)
  const manifest = JSON.parse(readFileSync(new URL('package.json', directory), 'utf8'))
  return `${name}@${manifest.version}\n\n${readFileSync(new URL('LICENSE', directory), 'utf8')}`
})
writeFileSync(new URL('../dist/schema-runtime.LICENSE.txt', import.meta.url), notices.join('\n\n---\n\n'))

const clientId = '@guosheng_047/dsh-erp'
await build({
  entryPoints: [fileURLToPath(new URL('../src/client/index.tsx', import.meta.url))],
  outfile: fileURLToPath(new URL('../dist/client.js', import.meta.url)),
  bundle: true, format: 'cjs', platform: 'browser', target: 'es2022', jsx: 'automatic', sourcemap: true, charset: 'utf8',
  external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-client-ui-slots', '@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-client-ui-dockkit',
    '@deepseek-ai/dsh-client-store'],
  define: { 'process.env.NODE_ENV': '"production"' },
  banner: { js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(clientId)}, factory: (require) => { var module = { exports: {} }; var exports = module.exports;` },
  footer: { js: 'return module.exports; } });' },
})
