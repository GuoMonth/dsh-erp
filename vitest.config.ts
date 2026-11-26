import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'tests/*.test.mjs',
      ...(process.env.ERP_CUA_DESKTOP_E2E === '1' ? ['tests/computer-desktop.integration.mjs'] : []),
    ],
    environment: 'node',
    pool: 'forks',
    // The browser suites launch Chromium and ERP workers alongside the test fork.
    maxWorkers: 4,
    testTimeout: 60_000,
    hookTimeout: 30_000,
    // Retain the registration order of the previous node:test teardown hooks.
    sequence: { hooks: 'list' },
  },
})
