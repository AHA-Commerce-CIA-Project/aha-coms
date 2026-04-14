import { treaty } from '@elysiajs/eden'
import type { App } from '~/server/index'

/**
 * Type-safe API client via Eden Treaty.
 * Empty string origin = same-origin requests (no CORS needed).
 * All routes and types are inferred from the Elysia App type.
 *
 * Usage:
 *   const { data } = await api.api.v1.dashboard.get()
 *   const { data } = await api.api.v1.employees.post({ body: { ... } })
 */
export const api = treaty<App>('')
