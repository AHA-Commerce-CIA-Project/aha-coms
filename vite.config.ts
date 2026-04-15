import path from 'path'
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  resolve: {
    alias: {
      '~': path.resolve(__dirname, 'src'),
    },
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      srcDirectory: 'src',
      router: {
        routesDirectory: 'routes',
        generatedRouteTree: 'routeTree.gen.ts',
      },
      importProtection: {
        client: {
          specifiers: [
            '@googleapis/sheets',
            '@googleapis/admin',
            'google-auth-library',
            'firebase-admin',
            'postgres',
            'drizzle-orm',
          ],
          files: ['**/server/services/**', '**/server/routes/**', '**/db/**'],
        },
      },
    }),
    viteReact(),
  ],
})
