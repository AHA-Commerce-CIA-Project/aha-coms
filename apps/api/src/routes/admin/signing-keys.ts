/**
 * Admin signing-key rotation endpoint (Rev 2 §01).
 *
 * Mounted under /api/v1/admin (inside the authPlugin-guarded group) so only
 * authenticated portal admins can trigger rotation.
 *
 * Cloud Scheduler fires POST /api/v1/admin/signing-keys/rotate on a 90-day
 * cadence for routine rotation. The same endpoint handles emergency rotation
 * (suspected compromise) — same flow, cleanup task fires immediately.
 */
import { Elysia } from 'elysia'
import { rotateActiveKey } from '~/services/signing-keys'

export const adminSigningKeyRoutes = new Elysia({ prefix: '/signing-keys' })

  /**
   * POST /api/v1/admin/signing-keys/rotate
   *
   * Generates a new ES256 key pair, stores the private half in Secret
   * Manager, atomically promotes it to `active` and moves the previous key
   * to `retiring`. The retiring key remains in JWKS for the broker-token TTL
   * grace window so in-flight tokens signed with the old key keep verifying.
   *
   * Returns:
   *   kid         — new active key ID
   *   status      — always 'active'
   *   retiringKid — previous key ID (null if there was no prior active key)
   */
  .post('/rotate', async ({ set }) => {
    try {
      const { newKid, previousKid } = await rotateActiveKey()

      console.info('[admin/signing-keys] rotation completed', {
        newKid,
        previousKid,
        trigger: 'manual',
      })

      set.status = 200
      return {
        kid: newKid,
        status: 'active',
        retiringKid: previousKid,
      }
    } catch (err) {
      console.error('[admin/signing-keys] rotation failed:', err instanceof Error ? err.message : err)
      set.status = 500
      return { message: 'Signing key rotation failed. Check server logs.' }
    }
  })
