import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/smoke/**/*.test.ts'],
    globalSetup: ['tests/smoke/global-setup.ts'],
    setupFiles: ['tests/smoke/setup.ts'],
    testTimeout: 15_000,
    hookTimeout: 30_000,
    sequence: { concurrent: false },
    reporters: ['verbose'],
  },
})
