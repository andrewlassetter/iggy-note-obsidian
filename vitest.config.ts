import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/__tests__/**/*.test.ts'],
  },
  resolve: {
    alias: {
      // Stub out the obsidian module — it's only available inside Obsidian's Electron runtime
      obsidian: new URL('./src/__mocks__/obsidian.ts', import.meta.url).pathname,
    },
  },
})
