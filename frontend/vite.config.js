import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// SECURITY WARNING: Never expose API keys via import.meta.env.VITE_*
// API calls should be made from a backend server, not the frontend
//
// Proxy target is overridable via VITE_BACKEND_PROXY_TARGET because "localhost"
// means something different inside a Docker container (the container itself,
// not the sibling backend container) than it does when both processes run
// directly on the host. docker-compose.yml sets this to http://backend:8000.
const backendProxyTarget = process.env.VITE_BACKEND_PROXY_TARGET || 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: backendProxyTarget,
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: backendProxyTarget,
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
