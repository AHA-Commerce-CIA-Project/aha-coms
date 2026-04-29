import { Elysia } from 'elysia'
import { logger as rootLogger } from '~/logger'

function extractIp(request: Request): string | undefined {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip') ?? undefined
}

export const requestIdPlugin = new Elysia({ name: 'request-id' })
  .derive({ as: 'global' }, ({ request }) => {
    const requestId = request.headers.get('x-coms-request-id') ?? crypto.randomUUID()
    const actorIp = extractIp(request)
    const log = rootLogger.child({ requestId })
    return { requestId, actorIp, log }
  })
  .onAfterHandle({ as: 'global' }, ({ requestId, set }) => {
    set.headers['x-coms-request-id'] = requestId
  })
