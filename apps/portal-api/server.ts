import { Elysia } from 'elysia'
import { app } from './src/index'

const server = new Elysia()
  .use(app)
  .listen(process.env.PORT ?? 3000)

console.log(`Server running at http://localhost:${server.server!.port}`)
