import { defineConfig } from 'vite'

// Bundles the harness renderer against the real src/ modules so the compositor
// under test is the shipped one, not a copy.
export default defineConfig({
  build: {
    outDir: 'verify-harness/dist',
    emptyOutDir: true,
    lib: {
      entry: 'verify-harness/renderer.ts',
      formats: ['iife'],
      name: 'harness',
      fileName: () => 'renderer.js',
    },
  },
})
