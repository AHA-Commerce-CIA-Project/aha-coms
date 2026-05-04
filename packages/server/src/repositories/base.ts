import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { sql } from 'drizzle-orm'
import type * as schema from '@coms/shared/db/schema'
import { db as defaultDb } from '@coms/shared/db'
import type { AuthUser } from '../middleware/auth'

/**
 * All repositories accept an optional transaction (`tx`) parameter.
 * When running inside RLS middleware, pass the transaction so queries
 * execute within the SET LOCAL scope. For operations outside
 * middleware (seed scripts, cron jobs), omit `tx` to use the default pool.
 */
export type DbClient = PostgresJsDatabase<typeof schema>

export function getDb(tx?: DbClient): DbClient {
  return tx ?? (defaultDb as unknown as DbClient)
}

export type RlsContext = Pick<AuthUser, 'id' | 'branchKey' | 'role' | 'teamKey'>

/**
 * Wraps a database operation in a short-lived transaction with RLS
 * session variables. The transaction commits immediately after the
 * callback returns, releasing the connection back to the pool.
 *
 * Batches all 4 set_config calls into a single SQL statement.
 */
export async function withRLS<T>(
  rlsCtx: RlsContext,
  fn: (db: DbClient) => Promise<T>,
): Promise<T> {
  const db = getDb()
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT
      set_config('app.current_user_id', ${rlsCtx.id}, true),
      set_config('app.current_branch_id', ${rlsCtx.branchKey ?? ''}, true),
      set_config('app.current_role', ${rlsCtx.role}, true),
      set_config('app.current_team_id', ${rlsCtx.teamKey ?? ''}, true)`)
    return fn(tx as unknown as DbClient)
  })
}
