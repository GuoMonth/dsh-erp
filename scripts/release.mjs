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
  for (const file of ['dist/native.js', 'dist/native-learning.js', 'dist/knowledge/sharing.js', 'docs/native-and-sharing.md']) assert.ok(names.includes(file), `Missing ${file}`)
  assert.ok(names.includes('docs/adaptive-learning.md'))
  assert.deepEqual(names.filter(name => /^readme(?:$|\.)/i.test(name)), ['README.md'], 'Keep one root README so npm selects English')
  assert.ok(names.includes('docs/README.zh-CN.md'), 'Missing Simplified Chinese guide')
  assert.ok(names.includes('docs/system-configuration.md'), 'Missing system configuration and migration guide')
  for (const name of ['dist/index.js', 'dist/worker.js', 'dist/storage/worker.js', 'cordis.patch.yml', 'LICENSE']) assert.ok(names.includes(name), `Missing ${name}`)
  assert.ok(!names.some(name => /^(artifacts|scripts|tests|node_modules|\.github)\//.test(name) || /(^|\/)\.npmrc$/.test(name) || /(^|\/)\.env($|\.)/.test(name)), 'Unexpected private/development files in package')
  assert.match(readFileSync('cordis.patch.yml', 'utf8'), /name:\s*'@guosheng_047\/dsh-erp'\s*$/m)
  assert.doesNotMatch(readFileSync('cordis.patch.yml', 'utf8'), /dsh-erp\/native/)
  const tarball = `${outputDir}/${packed.filename}`
  const bytes = readFileSync(tarball)
  const integrity = `sha512-${hash(bytes, 'sha512', 'base64')}`
  const state = { ...identity, name: pkg.name, sha, tarball, integrity }
  const registryState = checkRegistry(await getMetadata(pkg.name), identity, integrity)
  writeFileSync(`${outputDir}/state.json`, JSON.stringify(state, null, 2))
  writeFileSync(`${outputDir}/SHA256SUMS`, `${hash(bytes)}  ${packed.filename}\n`)
  writeFileSync(`${outputDir}/release-notes.md`, `${pkg.name}@${identity.version}\n\nERP 助手 (English: Adapt ERP) for local DSH 0.2.1-rc.5 and Node >=24.18 <25. The npm package name stays ${pkg.name}. Chinese UI shows ERP 助手. It ships no vendor connector and no knowledge of your site. This is not a universal ERP acceptance claim.\n\nInstall into the desktop profile, then restart the app:\n\n\`\`\`sh\nnpm exec --yes --package=pnpm@11.28.5 -- dsh plugin --profile desktop add ${pkg.name}@${identity.version}\n\`\`\`\n\nOpen ERP 助手. With no sites, the page is the setup form: a URL and an optional display name. There is no password field. Continue restores the last site that is still listed. That conversation stays in the middle, and its entry URL opens in the official sidebar Browser. Sign in yourself. If that site was removed, Continue does not open a different one. Each site keeps its own workspace folder, its own conversation, and its own local index. A conversation that is not bound to a site does not read another site's index.\n\nLater questions read the level summary and one page of evidence before a live observation. Opening a page and every ERP write need a fresh approval. The walk stops at depth 3 and is not an unattended crawl. This release does not continue an exploration queue an older build accepted from the model, and it does not use Deskwork. The primary share is a zip pack. It omits login, cookies, credentials, raw observations, screenshots, field samples, and confirmations. Read the text before sharing it. A Skill directory remains a secondary path.\n\nFor a host that is not the desktop app, use the same command with --profile web.\n\nUpgrade: call erp_storage_backup first, then install this version and restart. npm 0.1.3 is tools only and does not show this desktop entry. Saved knowledge stays on this machine. Test fixtures, benchmark answers, and user knowledge are not in the package.\n\n简体中文：装进桌面 profile 后重启。左侧中文是 ERP 助手，英文是 Adapt ERP，包名仍是 ${pkg.name}。没有站点时只有设置表单：一个网址和一个可选的显示名，没有密码栏。继续会恢复上次仍在列表里的站点：中间是该站点的对话，右侧官方浏览器打开入口网址，登录由你自己完成。每个站点有自己的工作区文件夹、对话和本地索引。分享主路径是 zip 包。之后的问题先读层级摘要和一页证据。打开页面和 ERP 写入各自需要批准。深度停在 3，不是无人值守爬站。不继续旧构建里由模型提交的探索队列，也不使用 Deskwork。升级前先调用 erp_storage_backup。npm 上的 0.1.3 只有工具，没有这个桌面入口。\n\n[English setup](https://github.com/${repository}/blob/${identity.tag}/README.md) · [简体中文](https://github.com/${repository}/blob/${identity.tag}/docs/README.zh-CN.md) · [Configuration and migration](https://github.com/${repository}/blob/${identity.tag}/docs/system-configuration.md) · [Changelog](https://github.com/${repository}/blob/${identity.tag}/CHANGELOG.md)\n\nSource commit: \`${sha}\`. The Action builds and verifies the published package and matching registry/GitHub bytes. Publication does not establish new real ERP, QR/SSO, Windows, or macOS acceptance. See the changelog.\n`)
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
