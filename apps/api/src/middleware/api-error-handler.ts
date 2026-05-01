import { logger } from '~/logger'

/**
 * Global onError handler for the API.  Two responsibilities:
 *
 * 1. Propagate Elysia status throws (`throw status(N, body)`) unchanged.  Elysia produces
 *    an `ELYSIA_RESPONSE`-tagged object carrying `.status` and `.response`; before this
 *    handler shipped, the catch-all 500 path clobbered the original status.  Symptom:
 *    every authPlugin-protected route returned HTTP 500 to unauthenticated callers even
 *    though the internal log line recorded the correct 401.
 *
 * 2. Log + sanitise genuine unhandled exceptions.  We never echo `error.message` for
 *    non-VALIDATION codes — Drizzle / Postgres errors carry the failing SQL + parameters,
 *    which would be an information-disclosure footgun on a public endpoint.
 */
export function handleApiError(context: {
  error: unknown
  code: string | number
  path?: string
  set: { status?: number | string; headers: Record<string, string | number> }
}) {
  const { error, code, path, set } = context
  const requestId = (context as Record<string, unknown>).requestId as string | undefined
  if (requestId) set.headers['x-coms-request-id'] = requestId

  // Elysia's `throw status(N, body)` yields an `ElysiaCustomStatusResponse` instance with
  // shape `{ code: number, response: unknown }` (NOT `status`).  Forward it intact.
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    'response' in error &&
    typeof (error as { code: unknown }).code === 'number'
  ) {
    const elysiaError = error as { code: number; response: unknown }
    set.status = elysiaError.code
    return elysiaError.response
  }

  logger.error({ err: error, path, requestId }, '[API Error]')

  if (code === 'VALIDATION') {
    return { message: error instanceof Error ? error.message : 'Bad request' }
  }

  set.status = 500
  return { message: 'Internal error' }
}
