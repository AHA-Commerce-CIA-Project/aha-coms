import { treaty } from '@elysiajs/eden'
import type { App } from '~/server/index'

/**
 * Type-safe API client via Eden Treaty.
 * Eden mangles an empty-string base into "https:/" which breaks fetches,
 * so we pass the real origin on the client and a localhost fallback for SSR.
 */
export const api = treaty<App>(
  typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
)
