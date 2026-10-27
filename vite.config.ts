import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  envDir: import.meta.dirname,
  envPrefix: 'VITE_',
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    // Preload UI dependencies used by the lazy-loaded student detail page.
    include: ['@base-ui/react/tabs', '@base-ui/react/toast', '@base-ui/react/avatar'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
