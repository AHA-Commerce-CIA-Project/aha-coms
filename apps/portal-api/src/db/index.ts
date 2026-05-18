import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

function createClient() {
  const raw = process.env.DATABASE_URL!
  const url = new URL(raw.includes('@/') ? raw.replace('@/', '@localhost/') : raw)
  const socketPath = url.searchParams.get('host')

  if (socketPath) {
    // Cloud SQL unix socket: pass host directly via config so postgres.js
    // actually uses the socket instead of connecting to the dummy hostname.
    url.searchParams.delete('host')
    return postgres(url.toString(), {
      host: socketPath,
      max: 3,
      // Fail fast on connect — don't let a hung Cloud SQL proxy stall a request.
      connect_timeout: 5,
      // Disable named prepared statements. In serverless/pooled environments
      // a recycled connection may not hold the prepared statement the client
      // expects, producing "prepared statement does not exist" errors.
      prepare: false,
    })
  }

  return postgres(raw, {
    max: 3,
    connect_timeout: 5,
    prepare: false,
  })
}

const client = createClient()

export const db = drizzle(client, { schema })
