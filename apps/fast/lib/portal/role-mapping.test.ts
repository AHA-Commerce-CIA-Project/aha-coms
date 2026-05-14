import { describe, expect, it } from 'bun:test'
import { mapPortalRoleToFastRole } from './role-mapping'

describe('mapPortalRoleToFastRole', () => {
  it('passes leader and admin through verbatim', () => {
    expect(mapPortalRoleToFastRole('leader')).toBe('leader')
    expect(mapPortalRoleToFastRole('admin')).toBe('admin')
  })

  it('normalises employee → member', () => {
    expect(mapPortalRoleToFastRole('employee')).toBe('member')
  })

  it('passes member through (idempotent under repeated mapping)', () => {
    expect(mapPortalRoleToFastRole('member')).toBe('member')
  })

  it('returns null for unknown values so the caller can skip the update', () => {
    expect(mapPortalRoleToFastRole('captain')).toBeNull()
    expect(mapPortalRoleToFastRole('')).toBeNull()
  })

  it('returns null for non-string inputs', () => {
    expect(mapPortalRoleToFastRole(null)).toBeNull()
    expect(mapPortalRoleToFastRole(undefined)).toBeNull()
    expect(mapPortalRoleToFastRole(42)).toBeNull()
    expect(mapPortalRoleToFastRole({})).toBeNull()
  })
})
