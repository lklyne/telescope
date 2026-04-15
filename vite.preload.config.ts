import { defineConfig } from 'vite'
import { builtinModules } from 'module'

// https://electron-forge.io/config/plugins/vite/
export default defineConfig({
  server: {
    watch: {
      usePolling: true,
      interval: 1000,
    },
  },
  build: {
    rollupOptions: {
      external: [
        'electron',
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`),
      ],
    },
  },
})
