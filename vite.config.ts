import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        onstart(args) {
          args.startup()
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: { external: ['electron'] },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart(args) {
          args.reload()
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            // Electron executes preload scripts in a sandboxed CommonJS context.
            // The plugin defaults to ESM here because package.json is type:module,
            // and an ESM preload never runs: window.electronAPI stays undefined and
            // every optional-chained call silently no-ops.
            lib: { formats: ['cjs'], fileName: () => 'preload.cjs' },
            rolldownOptions: { external: ['electron'] },
          },
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  server: {
    port: 5173,
  },
})
