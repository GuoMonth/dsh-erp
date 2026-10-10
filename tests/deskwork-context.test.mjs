import assert from 'node:assert/strict'
import { test } from 'node:test'
import { deskworkConfig } from '../dist/native.js'

const environment = { DESKWORK_HOST: '1', DESKWORK_SITE_CONTEXT: JSON.stringify({ id: 'site-one', name: 'Generated ERP', url: 'https://erp.example.test/app/work' }), DESKWORK_DATA_DIRECTORY: '/tmp/generated-profile' }

test('ERP owns its configuration from the generic Deskwork site contract', () => {
  assert.deepEqual(deskworkConfig({}, environment), { system: { url: 'https://erp.example.test/app/work', baseUrl: 'https://erp.example.test/app/', name: 'Generated ERP', account: 'site-one' }, dataDir: '/tmp/generated-profile/plugins/erp' })
  const explicit = { system: { url: 'https://custom.example.test/', account: 'custom' }, dataDir: '/tmp/explicit' }
  assert.deepEqual(deskworkConfig(explicit, environment), explicit)
  assert.equal(deskworkConfig(explicit, {}), explicit)
  assert.deepEqual(deskworkConfig({}, { DESKWORK_HOST: '1', DESKWORK_SITE_CONTEXT: 'null' }), {})
})

test('invalid host context fails before business configuration or browser startup', () => {
  assert.throws(() => deskworkConfig({}, { ...environment, DESKWORK_SITE_CONTEXT: '{broken' }))
  assert.throws(() => deskworkConfig({}, { ...environment, DESKWORK_DATA_DIRECTORY: undefined }))
  for (const url of ['file:///tmp/private', 'https://user:password@erp.example.test/']) {
    assert.throws(() => deskworkConfig({}, { ...environment, DESKWORK_SITE_CONTEXT: JSON.stringify({ id: 'one', name: 'Generated', url }) }))
  }
})
