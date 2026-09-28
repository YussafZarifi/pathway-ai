import { defineConfig, loadEnv } from 'vite'
import process from 'node:process'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // A build without the backend URL would ship an app whose every AI
  // request fails, so stop the build instead (see .env.example).
  if (command === 'build' && !loadEnv(mode, process.cwd(), 'VITE_').VITE_API_URL) {
    throw new Error('VITE_API_URL is not set. Copy frontend/.env.example to .env.local or set it on the host.')
  }

  return {
    plugins: [react()],
  }
})
