import { describe, expect, test } from 'bun:test'
import { Elysia } from 'elysia'
import { requestIdPlugin } from '~/middleware/request-id'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const app = new Elysia()
  .use(requestIdPlugin)
  .get('/ping', ({ requestId }) => ({ requestId }))

describe('request-ID middleware', () => {
  test('mints a UUID and sets it as response header', async () => {
    const res = await app.handle(new Request('http://localhost/ping'))
    const id = res.headers.get('x-coms-request-id')
    expect(id).toBeTruthy()
    expect(UUID_RE.test(id!)).toBe(true)
  })

  test('response body exposes requestId from derive', async () => {
    const res = await app.handle(new Request('http://localhost/ping'))
    const body = (await res.json()) as { requestId: string }
    expect(body.requestId).toBeTruthy()
    expect(UUID_RE.test(body.requestId)).toBe(true)
  })

  test('honours an inbound X-Coms-Request-Id', async () => {
    const inbound = '550e8400-e29b-41d4-a716-446655440000'
    const res = await app.handle(
      new Request('http://localhost/ping', {
        headers: { 'x-coms-request-id': inbound },
      }),
    )
    const header = res.headers.get('x-coms-request-id')
    const body = (await res.json()) as { requestId: string }
    expect(header).toBe(inbound)
    expect(body.requestId).toBe(inbound)
  })

  test('header and derive value match each other', async () => {
    const res = await app.handle(new Request('http://localhost/ping'))
    const header = res.headers.get('x-coms-request-id')!
    const body = (await res.json()) as { requestId: string }
    expect(header).toBe(body.requestId)
  })

  test('each unminted request gets a distinct UUID', async () => {
    const ids = await Promise.all(
      Array.from({ length: 5 }, () =>
        app
          .handle(new Request('http://localhost/ping'))
          .then((r) => r.headers.get('x-coms-request-id')),
      ),
    )
    const unique = new Set(ids)
    expect(unique.size).toBe(5)
  })

  test('F-1: non-UUID inbound X-Coms-Request-Id is rejected — response header is a fresh valid UUID', async () => {
    const forged = 'not-a-uuid'
    const res = await app.handle(
      new Request('http://localhost/ping', {
        headers: { 'x-coms-request-id': forged },
      }),
    )
    const header = res.headers.get('x-coms-request-id')!
    expect(header).not.toBe(forged)
    expect(UUID_RE.test(header)).toBe(true)
  })
})
