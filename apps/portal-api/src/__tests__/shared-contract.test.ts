import { describe, expect, test } from 'bun:test'
import {
  DEFAULT_AUTH_TRANSPORT_MODE,
  PORTAL_CLAIMS_VERSION,
  PORTAL_ROLE_LABELS,
  PORTAL_ROLES,
  hasPortalRole,
  isPortalRole,
} from '@coms-portal/shared'

describe('shared auth contract', () => {
  test('exposes the normalized role taxonomy and labels', () => {
    expect(PORTAL_ROLES).toEqual(['employee', 'admin'])
    expect(PORTAL_ROLE_LABELS.admin).toBe('Admin')
    expect(isPortalRole('unknown')).toBe(false)
  })

  test('supports hierarchical role access checks', () => {
    expect(hasPortalRole('admin', ['employee'])).toBe(true)
    expect(hasPortalRole('employee', ['admin'])).toBe(false)
  })

  test('publishes the current version of the portable contract defaults', () => {
    // Bumped to 2 in coms-shared v1.2.0 — Rev 2 widened
    // PortalBrokerHandoffResponse with tokenHs256 / tokenEs256 siblings.
    expect(PORTAL_CLAIMS_VERSION).toBe(2)
    expect(DEFAULT_AUTH_TRANSPORT_MODE).toBe('portable_token')
  })
})
