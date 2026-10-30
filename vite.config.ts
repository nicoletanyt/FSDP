import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  envDir: import.meta.dirname,
  envPrefix: 'VITE_',
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    // Pre-bundle dependencies used by the lazy-loaded student detail and check-in pages.
    include: ['@base-ui/react/tabs', '@base-ui/react/toast', '@base-ui/react/avatar', 'jsqr'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
