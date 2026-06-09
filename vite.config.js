import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    // Only use self-signed SSL locally (Vercel handles HTTPS in production)
    command === 'serve' ? basicSsl() : null,
  ].filter(Boolean),
  server: {
    allowedHosts: true,
    https: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false
      }
    }
  }
}))
