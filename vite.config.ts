import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// En développement, Vite (port 5173) relaie l'API et le WebSocket vers le serveur Node (port 3000)
const target = `http://localhost:${process.env.PORT || 3000}`

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // accessible depuis les autres PC du réseau
    port: 5173,
    proxy: {
      '/api': { target, changeOrigin: true },
      '/ws': { target: target.replace('http', 'ws'), ws: true },
    },
  },
})
