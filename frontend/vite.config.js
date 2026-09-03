import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// SECURITY WARNING: Never expose API keys via import.meta.env.VITE_*
// API calls should be made from a backend server, not the frontend
export default defineConfig({
  plugins: [react()],
  preview: {
    // Railway's generated domains plus any custom domains listed in
    // PREVIEW_ALLOWED_HOSTS (comma-separated, e.g. ".example.com,app.example.com").
    allowedHosts: [
      '.up.railway.app',
      ...(process.env.PREVIEW_ALLOWED_HOSTS || '').split(',').map(h => h.trim()).filter(Boolean),
    ],
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
