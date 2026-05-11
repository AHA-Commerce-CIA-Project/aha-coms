import { treaty } from '@elysiajs/eden'
import type { App } from '@coms/server'

type TreatyError = {
  readonly status?: number
  readonly value?: {
    readonly message?: string
    readonly error?: {
      readonly message?: string
    }
  }
}

/** Browser-side Eden Treaty client — same origin, cookies sent automatically */
export const api = treaty<App>('', {
  fetch: { credentials: 'include' },
})

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
