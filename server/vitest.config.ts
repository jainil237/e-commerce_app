import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    globalSetup: ['./tests/global-setup.ts'],
    // All test files share one MySQL *_test schema (rebuilt once by
    // global-setup, then reset between tests by each file's own beforeEach).
    // Running files in parallel would let them race on the same tables.
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 30000,
  },
})
