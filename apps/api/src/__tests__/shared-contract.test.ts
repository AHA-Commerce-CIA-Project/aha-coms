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

  test('publishes the first version of the portable contract defaults', () => {
    expect(PORTAL_CLAIMS_VERSION).toBe(1)
    expect(DEFAULT_AUTH_TRANSPORT_MODE).toBe('portable_token')
  })
})
