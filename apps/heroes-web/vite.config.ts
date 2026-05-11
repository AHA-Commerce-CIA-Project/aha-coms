import { paraglideVitePlugin } from '@inlang/paraglide-js'
import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { SvelteKitPWA } from '@vite-pwa/sveltekit'
import { defineConfig } from 'vite'

export default defineConfig({
  // Portal-web claims 5173 in the monorepo, so heroes-web binds 5174 by
  // default. Override via HEROES_WEB_DEV_PORT (kept in sync with the dev
  // proxy fallback in apps/heroes-api/src/index.ts).
  server: {
    port: Number(process.env.HEROES_WEB_DEV_PORT) || 5174,
  },
  plugins: [
    sveltekit(),
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/lib/paraglide',
      strategy: ['cookie', 'preferredLanguage', 'baseLocale'],
    }),
    tailwindcss(),
    SvelteKitPWA({
      registerType: 'prompt',
      manifest: false,
      workbox: {
        navigateFallback: null,
        globPatterns: ['**/*.{js,css,ico,png,svg,woff,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^\/api\//,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
})
