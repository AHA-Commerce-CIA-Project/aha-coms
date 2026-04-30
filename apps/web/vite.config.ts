import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  for (const [k, v] of Object.entries(env)) {
    if (process.env[k] === undefined) process.env[k] = v
  }
  return {
    plugins: [
      tailwindcss(),
      sveltekit(),
    ],
    server: {
      proxy: {
        '/api': 'http://localhost:3000',
      },
    },
  }
})
