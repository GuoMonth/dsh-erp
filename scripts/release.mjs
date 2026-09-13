import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const repository = 'GuoMonth/dsh-erp'
const registry = 'https://registry.npmjs.org'
const outputDir = 'artifacts/npm-release'
const hash = (data, algorithm = 'sha256', encoding = 'hex') => createHash(algorithm).update(data).digest(encoding)
const run = (command, args) => execFileSync(command, args, { encoding: 'utf8', timeout: 120_000 })

export function releaseIdentity(pkg, expected, ref) {
  assert.equal(ref, 'refs/heads/main', 'Release must run from main')
  assert.equal(pkg.name, '@guosheng_047/dsh-erp')
  assert.equal(pkg.version, expected, 'Requested version must match package.json')
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(alpha|beta|rc)\.(0|[1-9]\d*))?$/.exec(pkg.version)
  assert.ok(match, 'Use x.y.z or x.y.z-alpha/beta/rc.N')
  const npmTag = match[4] ?? 'latest'
  assert.equal(pkg.publishConfig?.tag, npmTag, 'Version and npm dist-tag must agree')
  assert.equal(pkg.publishConfig?.access, 'public')
  assert.equal(pkg.publishConfig?.registry, registry)
  assert.equal(pkg.repository?.url, `git+https://github.com/${repository}.git`)
  return { version: pkg.version, npmTag, tag: `v${pkg.version}`, prerelease: Boolean(match[4]) }
}

export function checkRegistry(metadata, identity, integrity) {
  const existing = metadata?.versions?.[identity.version]
  if (!existing) return { publishNeeded: true, packageExists: metadata !== null }
  assert.equal(existing.dist?.integrity, integrity, 'Published version has different bytes; bump the version')
  assert.equal(metadata['dist-tags']?.[identity.npmTag], identity.version, 'Existing version is not the current dist-tag; do not move it backwards')
  return { publishNeeded: false, packageExists: true }
}

async function getMetadata(name) {
  const response = await fetch(`${registry}/${encodeURIComponent(name)}`, { headers: { 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(20_000) })
  if (response.status === 404) return null
  assert.ok(response.ok, `Registry metadata failed: HTTP ${response.status}`)
  return response.json()
}

function checkGitTag(identity, sha) {
  const tags = run('git', ['tag', '--list', identity.tag]).trim()
  if (tags) assert.equal(run('git', ['rev-parse', `${identity.tag}^{commit}`]).trim(), sha, 'Existing Git tag points at another commit')
}

async function prepare() {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  const identity = releaseIdentity(pkg, process.env.RELEASE_VERSION, process.env.GITHUB_REF)
  const sha = run('git', ['rev-parse', 'HEAD']).trim()
  assert.equal(sha, process.env.GITHUB_SHA, 'Checkout must match the dispatched commit')
  assert.equal(run('git', ['status', '--porcelain', '--untracked-files=no']).trim(), '', 'Tracked files changed during build')
  checkGitTag(identity, sha)
  mkdirSync(outputDir, { recursive: true })
  const packed = JSON.parse(run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', outputDir]))[0]
  assert.equal(packed.name, pkg.name)
  assert.equal(packed.version, pkg.version)
  const names = packed.files.map(file => file.path)
  for (const name of ['dist/index.js', 'dist/worker.js', 'dist/storage/worker.js', 'dist/scm/trace.js', 'cordis.patch.yml', 'LICENSE']) assert.ok(names.includes(name), `Missing ${name}`)
  assert.ok(!names.some(name => /^(artifacts|scripts|tests|node_modules|\.github)\//.test(name) || /(^|\/)\.npmrc$/.test(name) || /(^|\/)\.env($|\.)/.test(name)), 'Unexpected private/development files in package')
  assert.match(readFileSync('cordis.patch.yml', 'utf8'), /name: ['"]?@guosheng_047\/dsh-erp['"]?\s*$/m)
  const tarball = `${outputDir}/${packed.filename}`
  const bytes = readFileSync(tarball)
  const integrity = `sha512-${hash(bytes, 'sha512', 'base64')}`
  const state = { ...identity, name: pkg.name, sha, tarball, integrity }
  const registryState = checkRegistry(await getMetadata(pkg.name), identity, integrity)
  writeFileSync(`${outputDir}/state.json`, JSON.stringify(state, null, 2))
  writeFileSync(`${outputDir}/SHA256SUMS`, `${hash(bytes)}  ${packed.filename}\n`)
  writeFileSync(`${outputDir}/release-notes.md`, `${pkg.name}@${identity.version}\n\nSCM/USA 只读预览范围与已验证平台见版本文档。发布 Action 执行构建、文件清单与 registry 产物校验；完整测试及真实 ERP 验收在本地完成，不因发布成功宣称新增业务验收。\n\n安装（已有 DSH 与 pnpm）：\n\n\`\`\`sh\ndsh plugin --profile web add ${pkg.name}@${identity.version}\n\`\`\`\n\n[使用与迁移](https://github.com/${repository}/blob/${identity.tag}/docs/scm-readonly.md) · [变更记录](https://github.com/${repository}/blob/${identity.tag}/CHANGELOG.md)\n\n构建提交：\`${sha}\`。附件 TGZ 与 npm registry 的内容逐字节核对。\n`)
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `tarball=${tarball}\nnpm_tag=${identity.npmTag}\npublish_needed=${registryState.publishNeeded}\npackage_exists=${registryState.packageExists}\n`)
  console.log(JSON.stringify({ ...state, ...registryState }))
}

async function finish() {
  const state = JSON.parse(readFileSync(`${outputDir}/state.json`, 'utf8'))
  let metadata
  for (let attempt = 0; attempt < 30; attempt++) {
    metadata = await getMetadata(state.name)
    if (metadata?.versions?.[state.version] && metadata['dist-tags']?.[state.npmTag] === state.version) break
    if (attempt < 29) {
      if (attempt % 6 === 0) console.log('Waiting for npm registry propagation; publication is not repeated.')
      await delay(5000)
    }
  }
  assert.equal(checkRegistry(metadata, state, state.integrity).publishNeeded, false, 'Published version not visible')
  const tarballUrl = new URL(metadata.versions[state.version].dist.tarball)
  assert.equal(tarballUrl.origin, registry)
  const response = await fetch(tarballUrl, { signal: AbortSignal.timeout(30_000) })
  assert.ok(response.ok, `Registry tarball failed: HTTP ${response.status}`)
  assert.equal(`sha512-${hash(Buffer.from(await response.arrayBuffer()), 'sha512', 'base64')}`, state.integrity, 'Downloaded registry bytes mismatch')
  checkGitTag(state, state.sha)
  const releases = JSON.parse(run('gh', ['api', `repos/${repository}/releases`, '--paginate', '--slurp'])).flat()
  const existing = releases.find(release => release.tag_name === state.tag)
  const files = [state.tarball, `${outputDir}/SHA256SUMS`]
  if (!existing) {
    run('gh', ['release', 'create', state.tag, ...files, '--repo', repository, '--target', state.sha, '--title', `${state.name} ${state.version}`, '--notes-file', `${outputDir}/release-notes.md`, ...(state.prerelease ? ['--prerelease'] : [])])
  } else {
    assert.equal(existing.draft, false, 'Existing release is a draft; review before retrying')
    assert.equal(existing.prerelease, state.prerelease)
    for (const file of files) {
      const name = file.split('/').at(-1)
      const asset = existing.assets.find(item => item.name === name)
      if (asset) assert.equal(asset.digest, `sha256:${hash(readFileSync(file))}`, 'Existing release asset differs; never overwrite')
      else run('gh', ['release', 'upload', state.tag, file, '--repo', repository])
    }
  }
  console.log(`Published and verified: ${state.name}@${state.version}; https://github.com/${repository}/releases/tag/${state.tag}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const mode = process.argv[2]
  if (mode === 'prepare') await prepare()
  else if (mode === 'finish') await finish()
  else throw new Error('Usage: node scripts/release.mjs prepare|finish')
}
