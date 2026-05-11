/**
 * Admin signing-key rotation endpoint tests (Rev 2 §01).
 *
 * Tests:
 *  - POST /signing-keys/rotate calls rotateActiveKey and returns kid + retiringKid
 *  - Returns 500 with error message if rotation fails
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test'

// ---------------------------------------------------------------------------
// Mock signing-keys service
// ---------------------------------------------------------------------------

let rotateResult: { newKid: string; previousKid: string | null } = {
  newKid: 'bk-new-1',
  previousKid: 'bk-old-1',
}
let rotateShouldFail = false

mock.module('~/services/signing-keys', () => ({
  rotateActiveKey: async () => {
    if (rotateShouldFail) throw new Error('Secret Manager unavailable')
    return rotateResult
  },
}))

const { adminSigningKeyRoutes } = await import('../signing-keys')

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function postRotate(): Promise<Response> {
  return adminSigningKeyRoutes.handle(
    new Request('http://localhost/signing-keys/rotate', { method: 'POST' }),
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /signing-keys/rotate', () => {
  beforeEach(() => {
    rotateShouldFail = false
    rotateResult = { newKid: 'bk-new-1', previousKid: 'bk-old-1' }
  })

  test('returns 200 with new kid, status=active, and retiringKid', async () => {
    const res = await postRotate()
    const body = await res.json() as Record<string, unknown>

    expect(res.status).toBe(200)
    expect(body.kid).toBe('bk-new-1')
    expect(body.status).toBe('active')
    expect(body.retiringKid).toBe('bk-old-1')
  })

  test('retiringKid is null when no prior active key existed', async () => {
    rotateResult = { newKid: 'bk-first', previousKid: null }

    const res = await postRotate()
    const body = await res.json() as Record<string, unknown>

    expect(res.status).toBe(200)
    expect(body.kid).toBe('bk-first')
    expect(body.retiringKid).toBeNull()
  })

  test('returns 500 with error message when rotation fails', async () => {
    rotateShouldFail = true

    const res = await postRotate()
    const body = await res.json() as Record<string, unknown>

    expect(res.status).toBe(500)
    expect(body.message).toBeString()
    expect((body.message as string).length).toBeGreaterThan(0)
  })
})
