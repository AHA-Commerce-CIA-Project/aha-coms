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

    // Reverse-proxy Firebase auth handler so popup/redirect runs same-origin
    if (url.pathname.startsWith('/__/')) {
      const firebaseUrl = `https://fbi-dev-484410.firebaseapp.com${url.pathname}${url.search}`
      const upstream = await fetch(firebaseUrl, {
        method: request.method,
        headers: { ...Object.fromEntries(request.headers.entries()), host: 'fbi-dev-484410.firebaseapp.com' },
        body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
        redirect: 'manual',
      })
      // Build clean response — fetch() decompresses the body so we must strip
      // content-encoding/content-length to avoid a browser decoding mismatch.
      const headers = new Headers(upstream.headers)
      headers.delete('content-encoding')
      headers.delete('content-length')
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
      })
    }

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
