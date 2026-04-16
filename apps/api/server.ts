import { Elysia } from 'elysia'
import { staticPlugin } from '@elysiajs/static'
import { app } from './src/index'

const STATIC_DIR = process.env.STATIC_DIR ?? 'public'

const server = new Elysia()
  .use(app)
  .use(staticPlugin({
    assets: STATIC_DIR,
    prefix: '/',
  }))
  .get('/*', ({ set }) => {
    set.headers['content-type'] = 'text/html'
    return Bun.file(`${STATIC_DIR}/index.html`)
  })
  .listen(process.env.PORT ?? 3000)

console.log(`Server running at http://localhost:${server.server!.port}`)
