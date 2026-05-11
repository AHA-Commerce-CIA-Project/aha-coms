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
    return postgres(url.toString(), { host: socketPath, max: 3 })
  }

  return postgres(raw, { max: 3 })
}

const client = createClient()

export const db = drizzle(client, { schema })
