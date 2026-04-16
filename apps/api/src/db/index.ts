import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

function createClient() {
  const raw = process.env.DATABASE_URL!
  // Cloud SQL socket URLs (e.g. postgresql://user:pass@/db?host=/cloudsql/...)
  // have no hostname, which breaks the postgres.js URL parser.
  // Insert a dummy hostname so the URL is parseable; the ?host= param still wins.
  const url = raw.includes('@/')
    ? raw.replace('@/', '@localhost/')
    : raw
  return postgres(url, { max: 3 })
}

const client = createClient()

export const db = drizzle(client, { schema })
