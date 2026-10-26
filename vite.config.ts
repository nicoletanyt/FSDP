import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  envDir: import.meta.dirname,
  envPrefix: 'VITE_',
  plugins: [react(), tailwindcss()],
})
