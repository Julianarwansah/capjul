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
    // The ffmpeg execution test needs node types, which only the electron
    // tsconfig project carries, so it lives there and is included here.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'electron/**/*.test.ts'],
  },
})
