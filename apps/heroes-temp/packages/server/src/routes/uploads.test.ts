import { describe, expect, it } from 'bun:test'
import { Elysia } from 'elysia'
import { uploadsRoute } from './uploads'

// Minimal app mounting the uploads route under /api/v1
const app = new Elysia({ prefix: '/api' }).group('/v1', (app) => app.use(uploadsRoute))

describe('GET /api/v1/uploads/signed-url', () => {
  it('returns signed URL data for valid request', async () => {
    const url = new URL('http://localhost/api/v1/uploads/signed-url')
    url.searchParams.set('filename', 'photo.jpg')
    url.searchParams.set('contentType', 'image/jpeg')

    const res = await app.handle(new Request(url))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.fileKey).toEndWith('.jpg')
    expect(body.data.uploadUrl).toBeTruthy()
  })

  it('returns 422 for invalid content type', async () => {
    const url = new URL('http://localhost/api/v1/uploads/signed-url')
    url.searchParams.set('filename', 'doc.pdf')
    url.searchParams.set('contentType', 'application/pdf')

    const res = await app.handle(new Request(url))
    expect(res.status).toBe(422)

    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('INVALID_FILE_TYPE')
  })
})

describe('GET /api/v1/uploads/:fileKey (dev mode)', () => {
  it('returns 404 for non-existent file', async () => {
    const res = await app.handle(new Request('http://localhost/api/v1/uploads/nonexistent.png'))
    expect(res.status).toBe(404)
  })
})
