import { Elysia } from 'elysia'
import { logger as rootLogger } from '~/logger'

function extractIp(request: Request): string | undefined {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip') ?? undefined
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const requestIdPlugin = new Elysia({ name: 'request-id' })
  .derive({ as: 'global' }, ({ request }) => {
    const incoming = request.headers.get('x-coms-request-id')
    const requestId = incoming && UUID_RE.test(incoming) ? incoming : crypto.randomUUID()
    const actorIp = extractIp(request)
    const log = rootLogger.child({ requestId })
    return { requestId, actorIp, log }
  })
  .onAfterHandle({ as: 'global' }, ({ requestId, set }) => {
    set.headers['x-coms-request-id'] = requestId
  })
