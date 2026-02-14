import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// SECURITY WARNING: Never expose API keys via import.meta.env.VITE_*
// API calls should be made from a backend server, not the frontend
export default defineConfig({
  plugins: [react()],
  preview: {
    allowedHosts: ['frontend-production-9f4d.up.railway.app'],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
