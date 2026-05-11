import { beforeEach, describe, expect, mock, test } from 'bun:test'

// ---------------------------------------------------------------------------
// Stubs — registered before importing the module under test
// ---------------------------------------------------------------------------

// Mock the dispatcher via the dedicated re-export shim (same pattern as
// provisioning-events.test.ts to avoid leaking into dispatcher tests).
const dispatchPortalWebhook = mock(async () => undefined)
mock.module('../portal-webhook-fanout', () => ({ dispatchPortalWebhook }))

const {
  emitAliasResolved,
  emitAliasUpdated,
  emitAliasDeleted,
} = await import('../alias-events')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const baseAlias = {
  id: 'alias-1',
  aliasNormalized: 'jane smith',
  identityUserId: 'user-1',
  isPrimary: true,
}

function resetState() {
  dispatchPortalWebhook.mockClear()
}

// ---------------------------------------------------------------------------
// emitAliasResolved
// ---------------------------------------------------------------------------

describe('emitAliasResolved', () => {
  beforeEach(resetState)

  test('dispatches alias.resolved with correct payload shape', async () => {
    await emitAliasResolved(baseAlias)

    expect(dispatchPortalWebhook).toHaveBeenCalledTimes(1)
    const [event, payload] = dispatchPortalWebhook.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(event).toBe('alias.resolved')
    expect(payload.aliasId).toBe('alias-1')
    expect(payload.aliasNormalized).toBe('jane smith')
    expect(payload.portalSub).toBe('user-1')
    expect(payload.isPrimary).toBe(true)
  })

  test('dispatches with isPrimary=false for non-primary alias', async () => {
    await emitAliasResolved({ ...baseAlias, isPrimary: false })

    const [, payload] = dispatchPortalWebhook.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(payload.isPrimary).toBe(false)
  })

  test('dispatches with no per-app filter (fanout to all)', async () => {
    await emitAliasResolved(baseAlias)

    const call = dispatchPortalWebhook.mock.calls[0] as unknown as unknown[]
    // Third argument (opts) should be absent — no appSlugs filter
    expect(call[2]).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// emitAliasUpdated
// ---------------------------------------------------------------------------

describe('emitAliasUpdated', () => {
  beforeEach(resetState)

  test('dispatches alias.updated with correct base payload', async () => {
    await emitAliasUpdated(baseAlias)

    expect(dispatchPortalWebhook).toHaveBeenCalledTimes(1)
    const [event, payload] = dispatchPortalWebhook.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(event).toBe('alias.updated')
    expect(payload.aliasId).toBe('alias-1')
    expect(payload.aliasNormalized).toBe('jane smith')
    expect(payload.portalSub).toBe('user-1')
    expect(payload.isPrimary).toBe(true)
  })

  test('includes previousIsPrimary when provided', async () => {
    await emitAliasUpdated(baseAlias, { previousIsPrimary: false })

    const [, payload] = dispatchPortalWebhook.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(payload.previousIsPrimary).toBe(false)
  })

  test('includes previousIdentityUserId when provided', async () => {
    await emitAliasUpdated(baseAlias, { previousIdentityUserId: 'user-0' })

    const [, payload] = dispatchPortalWebhook.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(payload.previousIdentityUserId).toBe('user-0')
  })

  test('omits previousIsPrimary from payload when not provided', async () => {
    await emitAliasUpdated(baseAlias, {})

    const [, payload] = dispatchPortalWebhook.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect('previousIsPrimary' in payload).toBe(false)
  })

  test('omits previousIdentityUserId from payload when not provided', async () => {
    await emitAliasUpdated(baseAlias)

    const [, payload] = dispatchPortalWebhook.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect('previousIdentityUserId' in payload).toBe(false)
  })

  // The rename two-step: alias service calls emitAliasUpdated twice in sequence.
  // This test verifies the correct call shapes for demote + promote.
  test('primary rename produces two alias.updated events with correct previousIsPrimary', async () => {
    const oldAlias = { id: 'alias-1', aliasNormalized: 'jane smith', identityUserId: 'user-1', isPrimary: false }
    const newAlias = { id: 'alias-2', aliasNormalized: 'jane a smith', identityUserId: 'user-1', isPrimary: true }

    // Demote: old alias loses primary, new alias gets primary
    await emitAliasUpdated(oldAlias, { previousIsPrimary: true })
    // Promote: new alias becomes primary
    await emitAliasUpdated(newAlias, { previousIsPrimary: false })

    expect(dispatchPortalWebhook).toHaveBeenCalledTimes(2)

    const [, demotePayload] = dispatchPortalWebhook.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(demotePayload.aliasId).toBe('alias-1')
    expect(demotePayload.isPrimary).toBe(false)
    expect(demotePayload.previousIsPrimary).toBe(true)

    const [, promotePayload] = dispatchPortalWebhook.mock.calls[1] as unknown as [string, Record<string, unknown>]
    expect(promotePayload.aliasId).toBe('alias-2')
    expect(promotePayload.isPrimary).toBe(true)
    expect(promotePayload.previousIsPrimary).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// emitAliasDeleted
// ---------------------------------------------------------------------------

describe('emitAliasDeleted', () => {
  beforeEach(resetState)

  test('dispatches alias.deleted with correct payload shape', async () => {
    await emitAliasDeleted(baseAlias)

    expect(dispatchPortalWebhook).toHaveBeenCalledTimes(1)
    const [event, payload] = dispatchPortalWebhook.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(event).toBe('alias.deleted')
    expect(payload.aliasId).toBe('alias-1')
    expect(payload.aliasNormalized).toBe('jane smith')
    expect(payload.portalSub).toBe('user-1')
  })

  test('does not include isPrimary in alias.deleted payload', async () => {
    await emitAliasDeleted(baseAlias)

    const [, payload] = dispatchPortalWebhook.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect('isPrimary' in payload).toBe(false)
  })

  test('dispatches with no per-app filter (fanout to all)', async () => {
    await emitAliasDeleted(baseAlias)

    const call = dispatchPortalWebhook.mock.calls[0] as unknown as unknown[]
    expect(call[2]).toBeUndefined()
  })
})
