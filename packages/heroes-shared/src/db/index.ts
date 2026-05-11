import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

function initDb() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set')

  // Cloud SQL Unix sockets: the ?host= query param contains the socket dir
  // (e.g. /cloudsql/project:region:instance). postgres.js can't handle this
  // natively — it ignores ?host= when a URL hostname exists, splits on colons,
  // and its array-host path detection uses Array.indexOf('/') which fails.
  // We bypass all of this by setting the socket path directly.
  const parsedUrl = new URL(connectionString)
  const socketDir = parsedUrl.searchParams.get('host')

  // Remove ?host= so postgres.js doesn't forward it as a server parameter
  if (socketDir) parsedUrl.searchParams.delete('host')
  const cleanedUrl = parsedUrl.toString()

  const client = postgres(cleanedUrl, {
    // Cloud SQL Auth Proxy Unix socket support
    ...(socketDir?.startsWith('/') && {
      path: socketDir + '/.s.PGSQL.5432',
    }),

    // --- Pool sizing (db-f1-micro: max_connections=40, minus ~3 reserved = 37 usable) ---
    // 15 per instance × 2 max instances = 30, leaves 7 headroom for migrations/admin
    max: Number(process.env.DB_POOL_MAX) || 15,

    // --- Aggressive serverless timeouts ---
    // Kill idle connections fast — Cloud Run may freeze the instance at any moment.
    // 5s idle keeps the pool warm for burst traffic without hoarding connections.
    idle_timeout: 5,
    // Fail fast on connect — don't let a hung Cloud SQL proxy stall the request.
    connect_timeout: 5,
    // Force connection recycling every 5 minutes. Cloud Run instances are ephemeral;
    // long-lived connections risk hitting Cloud SQL's own idle-disconnect (10 min)
    // and producing "connection terminated unexpectedly" errors on the next query.
    max_lifetime: 300,

    // --- Serverless essentials ---
    // Disable named prepared statements. In serverless/pooled environments,
    // a recycled connection may not have the prepared statement the client expects,
    // causing "prepared statement does not exist" errors.
    prepare: false,

    // Graceful shutdown: let in-flight queries finish (matches Cloud Run's SIGTERM grace)
    onclose: () => {
      console.log('[db] connection closed')
    },
  })

  // Graceful shutdown — release all connections when Cloud Run sends SIGTERM
  const shutdown = async () => {
    console.log('[db] draining pool...')
    await client.end({ timeout: 5 })
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  return drizzle(client, { schema })
}

let _db: ReturnType<typeof drizzle<typeof schema>>

export const db = new Proxy({} as typeof _db, {
  get(_, prop, receiver) {
    _db ??= initDb()
    return Reflect.get(_db, prop, receiver)
  },
})
