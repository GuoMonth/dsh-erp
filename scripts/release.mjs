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
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(alpha|beta|rc)\.(0|[1-9]\d*))?$/

// Compare the release formats accepted by this repository without lexical ordering
// (for example, alpha.10 must sort after alpha.9).
function compareVersions(left, right) {
  const parts = version => {
    const match = versionPattern.exec(version)
    assert.ok(match, `Unsupported registry version: ${version}`)
    return [BigInt(match[1]), BigInt(match[2]), BigInt(match[3]),
      BigInt({ alpha: 0, beta: 1, rc: 2 }[match[4]] ?? 3), BigInt(match[5] ?? 0)]
  }
  const a = parts(left)
  const b = parts(right)
  for (let index = 0; index < a.length; index++) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1
  }
  return 0
}

export function releaseIdentity(pkg, expected, ref) {
  assert.equal(ref, 'refs/heads/main', 'Release must run from main')
  assert.equal(pkg.name, '@guosheng_047/dsh-erp')
  assert.equal(pkg.version, expected, 'Requested version must match package.json')
  const match = versionPattern.exec(pkg.version)
  assert.ok(match, 'Use x.y.z or x.y.z-alpha/beta/rc.N')
  const npmTag = 'latest'
  assert.equal(pkg.publishConfig?.tag, npmTag, 'Every release, including previews, must publish to latest')
  assert.equal(pkg.publishConfig?.access, 'public')
  assert.equal(pkg.publishConfig?.registry, registry)
  assert.equal(pkg.repository?.url, `git+https://github.com/${repository}.git`)
  return { version: pkg.version, npmTag, tag: `v${pkg.version}`, prerelease: Boolean(match[4]) }
}

export function checkRegistry(metadata, identity, integrity) {
  const latest = metadata?.['dist-tags']?.latest
  if (latest) assert.ok(compareVersions(identity.version, latest) >= 0, 'Release would move latest backwards')
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
  assert.ok(!names.some(n => /^(dist\/scm|docs\/(testing|assessments)|tests|artifacts)\//.test(n) || /(?:^|\/)(?:store\.sqlite|browser-profiles|evidence|exports)(?:[/.]|$)/.test(n)), 'Do not publish site adapters, benchmark data or user knowledge')
  assert.ok(names.includes('dist/browser/snapshot.js'))
  assert.ok(names.includes('docs/adaptive-learning.md'))
  assert.deepEqual(names.filter(name => /^readme(?:$|\.)/i.test(name)), ['README.md'], 'Keep one root README so npm selects English')
  assert.ok(names.includes('docs/README.zh-CN.md'), 'Missing Simplified Chinese guide')
  assert.ok(names.includes('docs/system-configuration.md'), 'Missing system configuration and migration guide')
  for (const name of ['dist/index.js', 'dist/worker.js', 'dist/storage/worker.js', 'cordis.patch.yml', 'LICENSE']) assert.ok(names.includes(name), `Missing ${name}`)
  assert.ok(!names.some(name => /^(artifacts|scripts|tests|node_modules|\.github)\//.test(name) || /(^|\/)\.npmrc$/.test(name) || /(^|\/)\.env($|\.)/.test(name)), 'Unexpected private/development files in package')
  assert.match(readFileSync('cordis.patch.yml', 'utf8'), /name: ['"]?@guosheng_047\/dsh-erp['"]?\s*$/m)
  const tarball = `${outputDir}/${packed.filename}`
  const bytes = readFileSync(tarball)
  const integrity = `sha512-${hash(bytes, 'sha512', 'base64')}`
  const state = { ...identity, name: pkg.name, sha, tarball, integrity }
  const registryState = checkRegistry(await getMetadata(pkg.name), identity, integrity)
  writeFileSync(`${outputDir}/state.json`, JSON.stringify(state, null, 2))
  writeFileSync(`${outputDir}/SHA256SUMS`, `${hash(bytes)}  ${packed.filename}\n`)
  writeFileSync(`${outputDir}/release-notes.md`, `${pkg.name}@${identity.version}\n\nAdapt ERP: a general browser-learning preview for local DSH 0.1.5-rc.2 and Node >=24.18 <25. Configure your ERP, log in manually and build your own local knowledge from its UI. No vendor-specific API or preloaded site knowledge is required. Compatibility varies; this is not a universal ERP acceptance claim.\n\nInstall (existing DSH):\n\n\`\`\`sh\nnpm exec --yes --package=pnpm@11.7.0 -- dsh plugin --profile web add ${pkg.name}@${identity.version}\n\`\`\`\n\nBefore connecting, configure system.url in the erp row of your DSH profile cordis.patch.yml and restart DSH. The plugin opens that entry for you to log in manually; confirm the configured account/company/role before observation. Every click, fill, selection or scroll needs individual approval, including possible writes and autosaving queries. Observations and local knowledge accumulate automatically after confirmation. Saved knowledge can be queried later without login; page data requires current observation permission.\n\nUpgrade: back up first. Alpha.5 system IDs and knowledge remain; fixed erp_scm_* tools are removed. Earlier root-level knowledge is retained but not automatically imported. Test fixtures, benchmark answers and user knowledge are excluded from npm. Multi-ERP routing and unattended full-site learning remain deferred.\n\n简体中文：配置自己的 ERP 并自行登录，通过通用页面观察学习。每次页面交互单独确认，本地知识自动积累并跨对话使用。SCM/USA 仅保留为开发测试基准，测试答案和用户知识不随包发布。升级前备份。\n\n[English setup](https://github.com/${repository}/blob/${identity.tag}/README.md) · [简体中文](https://github.com/${repository}/blob/${identity.tag}/docs/README.zh-CN.md) · [Configuration and migration](https://github.com/${repository}/blob/${identity.tag}/docs/system-configuration.md) · [Changelog](https://github.com/${repository}/blob/${identity.tag}/CHANGELOG.md)\n\nSource commit: \`${sha}\`. The Action builds and verifies the published package and matching registry/GitHub bytes. Publication does not establish new real ERP, QR/SSO or cross-platform acceptance; see the version validation documents.\n`)
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
