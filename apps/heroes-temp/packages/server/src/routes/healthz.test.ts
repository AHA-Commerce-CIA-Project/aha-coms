import { describe, expect, it } from 'bun:test'
import { Elysia } from 'elysia'
import { healthz } from './healthz'

const app = new Elysia({ prefix: '/api' }).use(healthz)

describe('GET /api/healthz', () => {
  it('returns 200 with status ok', async () => {
    const res = await app.handle(new Request('http://localhost/api/healthz'))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.status).toBe('ok')
  })
})
