import { Elysia } from 'elysia'

/**
 * Liveness probe — always returns 200.
 * Used by Cloud Run liveness probe to confirm the process is alive
 * without coupling to external dependencies like the database.
 */
export const healthz = new Elysia().get('/healthz', () => ({
  status: 'ok',
}))
