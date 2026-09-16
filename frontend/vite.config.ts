import path from 'path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const currentDir = import.meta.dirname
  const rootEnvDir = path.resolve(currentDir, '..')
  const env = loadEnv(mode, rootEnvDir, '')

  const frontendPort = parseInt(env.FRONTEND_PORT || '5173', 10)
  const backendPort = parseInt(env.BACKEND_PORT || '5005', 10)

  console.log(`[Vite] Loaded root .env -> FRONTEND_PORT=${frontendPort}, BACKEND_PORT=${backendPort}`)

  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(currentDir, './src'),
      },
    },
    server: {
      port: frontendPort,
      host: true,
      proxy: {
        '/api': {
          target: `http://localhost:${backendPort}`,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  }
})
