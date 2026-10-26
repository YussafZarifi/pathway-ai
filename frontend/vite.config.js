import { defineConfig, loadEnv } from 'vite'
import fs from 'node:fs'
import process from 'node:process'
import react from '@vitejs/plugin-react'

function resumeDemoPlugin(demoPath) {
  return {
    name: 'pathwayai-resume-demo',
    configureServer(server) {
      server.middlewares.use('/__resume-demo', (_request, response) => {
        if (!fs.existsSync(demoPath)) {
          response.statusCode = 404
          response.end('Demo resume not found')
          return
        }
        response.setHeader('Content-Type', 'application/pdf')
        fs.createReadStream(demoPath).pipe(response)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // A build without the backend URL would ship an app whose every AI
  // request fails, so stop the build instead (see .env.example).
  if (command === 'build' && !loadEnv(mode, process.cwd(), 'VITE_').VITE_API_URL) {
    throw new Error('VITE_API_URL is not set. Copy frontend/.env.example to .env.local or set it on the host.')
  }

  return {
    plugins: [react(), ...(command === 'serve' && env.RESUME_DEMO_ENABLED === 'true' && env.RESUME_DEMO_PATH ? [resumeDemoPlugin(env.RESUME_DEMO_PATH)] : [])],
    // Vitest (npm test): jsdom, no network. Accounts are off unless a test
    // mocks lib/supabase; the API URL is a placeholder (fetch is mocked).
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{js,jsx}'],
      setupFiles: ['src/test/setup.js'],
      env: {
        VITE_API_URL: 'http://api.test',
        VITE_SUPABASE_URL: '',
        VITE_SUPABASE_PUBLISHABLE_KEY: '',
      },
      restoreMocks: true,
    },
  }
})
