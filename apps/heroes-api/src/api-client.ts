import { treaty } from '@elysiajs/eden'
import type { App } from './index'

type TreatyError = {
  readonly value?: {
    readonly error?: {
      readonly message?: string
    }
  }
}

/** Server-side Eden Treaty client factory — forwards cookies from the incoming request */
export function createServerApi(request: Request) {
  // On Cloud Run, TLS terminates at the load balancer so the internal URL is http://.
  // Use x-forwarded-proto to reconstruct the external origin, ensuring Better Auth
  // resolves the correct __Secure- cookie prefix.
  const url = new URL(request.url)
  const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '')
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host
  return treaty<App>(`${proto}://${host}`, {
    headers: {
      cookie: request.headers.get('cookie') ?? '',
    },
  })
}

/** Extract data from an Eden Treaty response, throwing on error */
export function unwrap(
  result: { data: unknown; error: TreatyError | null },
  fallback: string,
) {
  if (result.error) {
    throw new Error(result.error.value?.error?.message ?? fallback)
  }
  return result.data
}
