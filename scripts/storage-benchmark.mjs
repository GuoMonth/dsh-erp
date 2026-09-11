// Synthetic local benchmark; never opens an ERP or uses existing plugin data.
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { monitorEventLoopDelay } from 'node:perf_hooks'
import { StorageClient, restoreBackup } from '../dist/index.js'

const root = await mkdtemp(join(tmpdir(), 'erp-storage-bench-'))
const directory = join(root, 'data')
const client = new StorageClient({ directory })
const restored = new StorageClient({ directory: join(root, 'restored') })
const loop = monitorEventLoopDelay({ resolution: 10 })
const scope = { site: 'synthetic-benchmark', account: 'reader' }
const durations = {}
async function measure(name, run) {
  const begin = performance.now(); await run(); durations[name] = Math.round(performance.now() - begin)
}
try {
  loop.enable()
  await measure('openMs', () => client.call('status', {}))
  await measure('insert1000Ms', async () => {
    for (let i = 0; i < 1000; i++) await client.call('observe', {
      id: `benchmark-${i}`, scope, url: 'https://example.invalid/erp', title: `采购订单 ${i}`,
      text: 'Synthetic observed content. '.repeat(80), locale: 'zh-CN', context: 'benchmark',
      observedAt: '2026-09-11T00:00:00.000Z',
      evidence: { mime: 'text/plain', base64: Buffer.from(`Synthetic evidence ${i}`).toString('base64') },
    })
  })
  await measure('search100Ms', async () => {
    for (let i = 0; i < 100; i++) assert.equal((await client.call('search', { scope, query: i % 2 ? '采购订单' : '采购', limit: 10 })).length, 10)
  })
  let backup
  await measure('backupMs', async () => { backup = await client.call('backup', {}) })
  await measure('restoreAndCheckMs', async () => {
    await restoreBackup(directory, backup.id, restored.directory)
    assert.equal((await restored.call('status', {})).observations, 1000)
    assert.deepEqual(await restored.call('check', {}), { databaseOk: true, missing: [], corrupt: [], orphaned: [] })
  })
  loop.disable()
  console.log(JSON.stringify({ platform: `${process.platform}/${process.arch}`, node: process.versions.node,
    sqlite: (await client.call('status', {})).sqliteVersion, syntheticRecords: 1000,
    ...durations, hostEventLoopP99Ms: +(loop.percentile(99) / 1e6).toFixed(1),
    hostEventLoopMaxMs: +(loop.max / 1e6).toFixed(1) }, null, 2))
} finally { loop.disable(); await client.dispose(); await restored.dispose(); await rm(root, { recursive: true, force: true }) }
