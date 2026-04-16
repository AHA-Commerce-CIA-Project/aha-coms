import { Elysia } from 'elysia'
import { app } from './src/index'
import { resolve } from 'path'

const STATIC_DIR = resolve(process.env.STATIC_DIR ?? 'public')

const server = new Elysia()
  .use(app)
  .get('/*', async ({ set, path }) => {
    // Try serving the exact static file first
    const file = Bun.file(`${STATIC_DIR}${path}`)
    if (await file.exists()) {
      return file
    }
    // SPA fallback
    set.headers['content-type'] = 'text/html'
    return Bun.file(`${STATIC_DIR}/index.html`)
  })
  .listen(process.env.PORT ?? 3000)

console.log(`Server running at http://localhost:${server.server!.port}`)
