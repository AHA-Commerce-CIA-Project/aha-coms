import { treaty } from '@elysiajs/eden'
import type { App } from '@coms-portal/heroes-api'

type TreatyError = {
  readonly status?: number
  readonly value?: {
    readonly message?: string
    readonly error?: {
      readonly message?: string
    }
  }
}

/**
 * Browser-side Eden Treaty client — same origin, cookies sent automatically.
 *
 * Heroes-api lives under the `/heroes` constructor prefix (Spec 02 Phase 1 /
 * T26), so the typed App roots every route under a leading `heroes` segment.
 * Pre-traversing into that segment here keeps call sites tidy: consumers can
 * still write `api.api.v1.users.get()` instead of `api.heroes.api.v1.users…`.
 */
export const api = treaty<App>('', {
  fetch: { credentials: 'include' },
}).heroes

/** Extract data from an Eden response, throwing on error */
export function unwrap<T>(
  result: { data: T | null; error: TreatyError | null },
  fallback: string,
): T {
  if (result.error) {
    const msg = result.error.value?.error?.message ?? fallback
    throw new Error(msg)
  }
  return result.data!
}

export function getErrorMessage(error: TreatyError | null | undefined, fallback: string): string {
  return error?.value?.error?.message ?? error?.value?.message ?? fallback
}
