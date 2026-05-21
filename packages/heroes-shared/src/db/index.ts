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

    // --- Pool sizing -----------------------------------------------------
    // coms-aha-heroes-db (db-f1-micro): Postgres max_connections = 25, of
    // which superuser_reserved_connections = 3 (Postgres default) — leaving
    // ~22 open paths for app-role users (coms_aha_heroes_app,
    // coms_portal_app). The instance is shared with the `coms_portal`
    // database on the same backend. Worst-case fleet draw with every Cloud
    // Run service at max_instance_count:
    //
    //   heroes-api   3 × 2 max instances = 6
    //   heroes-web   3 × 2 max instances = 6
    //   portal-api   3 × 2 max instances = 6
    //   portal-web   3 × 2 max instances = 6
    //                                     —
    //                                    24 theoretical, vs 22 app-bucket
    //
    // The -2 paper deficit is tempered by four caveats:
    //   (a) simultaneous max-scale across all four services is theoretical
    //       — Cloud Run scaling is gradual, traffic distributes unevenly;
    //   (b) the aha-fast-db audit observed 24 backends on its own
    //       db-f1-micro without server-side rejection, suggesting Cloud
    //       SQL's enforcement of the superuser reservation is more
    //       permissive than stock Postgres;
    //   (c) migrations (`bun db:push`) borrow their own connection during
    //       deploy — covered by typical headroom but not guaranteed at peak;
    //   (d) DB_POOL_MAX env override lets ops dial each service to max:2
    //       (16 fleet worst case) without a redeploy.
    //
    // Prior shape was max=15 sized against a phantom max_connections=40
    // ceiling (db-f1-micro default has always been 25 — see commits ed9c754
    // and 67fd193 confirming the live `databaseFlags=null` state). At
    // max=15 a single (heroes-api + heroes-web) pair could exceed 25 on
    // its own; the fleet's worst-case draw was 72 against a 25 ceiling.
    //
    // 2026-05-21 addendum: idle_timeout: 30 added below so the per-instance
    // baseline draw is traffic-proportional rather than fleet-proportional.
    // The theoretical -2 deficit above remains the upper bound for sizing
    // decisions but isn't observed in practice — May 2026 baseline read of
    // pg_stat_activity showed peak ~11 backends across all databases on
    // this instance vs the 22 app-bucket ceiling. The bump from 25 → 30
    // discussed in this corridor was deemed unnecessary against that data
    // and is not applied; if peak ever crosses ~18 in a 7-day window,
    // re-evaluate (see `gcloud sql instances patch coms-aha-heroes-db
    // --database-flags=max_connections=30` for the runbook).
    max: Number(process.env.DB_POOL_MAX) || 3,

    // Close idle pool connections after 30s. Pays a one-time ~10-20ms
    // cold-acquire on the first query following a quiet window; in
    // exchange the pool's idle baseline (visible in pg_stat_activity)
    // drops from `pool.max × num_instances` down to whatever the current
    // request fan-in needs. Mirrors the Cloud Run `min-instances=0`
    // tradeoff applied at the DB pool layer.
    idle_timeout: 30,

    // Fail fast on connect — don't let a hung Cloud SQL proxy stall a request.
    connect_timeout: 5,

    // Disable named prepared statements. In serverless/pooled environments
    // a recycled connection may not hold the prepared statement the client
    // expects, producing "prepared statement does not exist" errors.
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
