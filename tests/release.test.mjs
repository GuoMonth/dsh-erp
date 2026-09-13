import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { releaseIdentity, checkRegistry } from '../scripts/release.mjs'

const source = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const pkg = { ...source, version: '1.2.3-alpha.1' }

test('release requires latest and refuses wrong branch, package and requested version', () => {
  const identity = releaseIdentity(pkg, pkg.version, 'refs/heads/main')
  assert.equal(identity.npmTag, 'latest')
  assert.equal(identity.prerelease, true)
  assert.throws(() => releaseIdentity(pkg, pkg.version, 'refs/heads/feature'))
  assert.throws(() => releaseIdentity(pkg, '9.9.9', 'refs/heads/main'))
  assert.throws(() => releaseIdentity({ ...pkg, name: 'dsh-erp' }, pkg.version, 'refs/heads/main'))
  assert.throws(() => releaseIdentity({ ...pkg, publishConfig: { ...pkg.publishConfig, tag: 'alpha' } }, pkg.version, 'refs/heads/main'))
})

test('all supported release stages update latest while GitHub keeps preview status', () => {
  for (const version of ['1.2.3-alpha.10', '1.2.3-beta.2', '1.2.3-rc.1', '1.2.3']) {
    const identity = releaseIdentity({ ...pkg, version }, version, 'refs/heads/main')
    assert.equal(identity.npmTag, 'latest')
    assert.equal(identity.prerelease, version.includes('-'))
  }
})

test('release distinguishes missing package, new version and exact retry; refuses different bytes or tag rollback', () => {
  const identity = releaseIdentity(pkg, pkg.version, 'refs/heads/main')
  assert.deepEqual(checkRegistry(null, identity, 'sha512-example'), { publishNeeded: true, packageExists: false })
  assert.deepEqual(checkRegistry({ versions: {} }, identity, 'sha512-example'), { publishNeeded: true, packageExists: true })
  const metadata = { versions: { [pkg.version]: { dist: { integrity: 'sha512-example' } } }, 'dist-tags': { latest: pkg.version } }
  assert.deepEqual(checkRegistry(metadata, identity, 'sha512-example'), { publishNeeded: false, packageExists: true })
  assert.throws(() => checkRegistry(metadata, identity, 'sha512-different'))
  assert.throws(() => checkRegistry({ ...metadata, 'dist-tags': { latest: '9.0.0-alpha.1' } }, identity, 'sha512-example'))
  assert.throws(() => checkRegistry({ ...metadata, 'dist-tags': { alpha: pkg.version } }, identity, 'sha512-example'), /current dist-tag/)
})

test('new publications cannot roll latest backwards; version components and preview stages compare numerically', () => {
  for (const [latest, next, allowed] of [
    ['0.1.0-alpha.6', '0.1.0-alpha.7', true],
    ['1.2.3-alpha.9', '1.2.3-alpha.10', true],
    ['1.2.3-alpha.10', '1.2.3-alpha.9', false],
    ['1.2.3-alpha.10', '1.2.3-beta.1', true],
    ['1.2.3-beta.1', '1.2.3-rc.1', true],
    ['1.2.3-rc.1', '1.2.3', true],
    ['1.2.3', '1.2.3-rc.2', false],
    ['1.2.3', '1.2.4-alpha.1', true],
    ['1.9.9', '1.10.0-alpha.1', true],
    ['2.0.0', '1.99.99', false],
  ]) {
    const identity = releaseIdentity({ ...pkg, version: next }, next, 'refs/heads/main')
    const check = () => checkRegistry({ versions: {}, 'dist-tags': { latest } }, identity, 'sha512-example')
    if (allowed) assert.equal(check().publishNeeded, true, `${latest} -> ${next}`)
    else assert.throws(check, /backwards/, `${latest} -> ${next}`)
  }
})
