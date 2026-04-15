import { join } from 'path'

// TanStack Start SSR handler
const app = await import('./dist/server/server.js')

const CLIENT_DIR = join(import.meta.dir, 'dist', 'client')

const CONTENT_TYPES: Record<string, string> = {
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

Bun.serve({
  port: process.env.PORT || 3000,
  async fetch(request) {
    const url = new URL(request.url)

    // Serve static assets from dist/client
    if (url.pathname.startsWith('/assets/') || url.pathname === '/favicon.ico') {
      const filePath = join(CLIENT_DIR, url.pathname)
      const file = Bun.file(filePath)
      if (await file.exists()) {
        const ext = url.pathname.slice(url.pathname.lastIndexOf('.'))
        return new Response(file, {
          headers: {
            'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream',
            'Cache-Control': url.pathname.startsWith('/assets/')
              ? 'public, max-age=31536000, immutable'
              : 'public, max-age=3600',
          },
        })
      }
    }

    // Delegate to TanStack Start SSR
    return app.default.fetch(request)
  },
})
