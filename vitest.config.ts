import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Separate from vite.config.ts on purpose: the Electron plugin there would try to
// build main/preload during a test run.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
