import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { releaseIdentity, checkRegistry } from '../scripts/release.mjs'

const source = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const pkg = { ...source, version: '1.2.3-alpha.1', publishConfig: { ...source.publishConfig, tag: 'alpha' } }

test('release refuses wrong branch, package, requested version and stable tag for a preview', () => {
  const identity = releaseIdentity(pkg, pkg.version, 'refs/heads/main')
  assert.equal(identity.npmTag, 'alpha')
  assert.equal(identity.prerelease, true)
  assert.throws(() => releaseIdentity(pkg, pkg.version, 'refs/heads/feature'))
  assert.throws(() => releaseIdentity(pkg, '9.9.9', 'refs/heads/main'))
  assert.throws(() => releaseIdentity({ ...pkg, name: 'dsh-erp' }, pkg.version, 'refs/heads/main'))
  assert.throws(() => releaseIdentity({ ...pkg, publishConfig: { ...pkg.publishConfig, tag: 'latest' } }, pkg.version, 'refs/heads/main'))
})

test('release distinguishes missing package, new version and exact retry; refuses different bytes or tag rollback', () => {
  const identity = releaseIdentity(pkg, pkg.version, 'refs/heads/main')
  assert.deepEqual(checkRegistry(null, identity, 'sha512-example'), { publishNeeded: true, packageExists: false })
  assert.deepEqual(checkRegistry({ versions: {} }, identity, 'sha512-example'), { publishNeeded: true, packageExists: true })
  const metadata = { versions: { [pkg.version]: { dist: { integrity: 'sha512-example' } } }, 'dist-tags': { alpha: pkg.version } }
  assert.deepEqual(checkRegistry(metadata, identity, 'sha512-example'), { publishNeeded: false, packageExists: true })
  assert.throws(() => checkRegistry(metadata, identity, 'sha512-different'))
  assert.throws(() => checkRegistry({ ...metadata, 'dist-tags': { alpha: '9.0.0-alpha.1' } }, identity, 'sha512-example'))
})
