/**
 * RBAC — exercises the super_admin capability gate added in spec-06 PR E.
 *
 * super_admin is internal-only.  External surfaces (`requireRole`, session JWT claims,
 * webhook payloads) collapse super_admin to 'admin' so H-apps and existing consumers
 * see the unchanged enum.  Portal-private capabilities (one-time login links, future
 * security-sensitive admin actions) gate on super_admin specifically — `checkSuperAdmin`
 * is the predicate that bypasses the collapse, and `requireSuperAdmin()` is the Elysia
 * plugin that wraps it.
 *
 * We unit-test the predicate directly.  The Elysia plugin is a thin wrapper that
 * delegates to the predicate, so route-level integration coverage of the gate lands
 * in the route's own test (e.g., one-time-login-link.test.ts).
 */
import { test, expect } from 'bun:test'
import { checkSuperAdmin } from '../rbac'

test('null authUser → 401 Unauthorized', () => {
  expect(checkSuperAdmin(null)).toEqual({ ok: false, status: 401, message: 'Unauthorized' })
  expect(checkSuperAdmin(undefined)).toEqual({ ok: false, status: 401, message: 'Unauthorized' })
})

test('employee → 403 Insufficient portal role', () => {
  expect(checkSuperAdmin({ portalRole: 'employee' })).toEqual({
    ok: false,
    status: 403,
    message: 'Insufficient portal role',
  })
})

test('admin → 403 (gate is strict — does NOT collapse-up like requireRole does)', () => {
  expect(checkSuperAdmin({ portalRole: 'admin' })).toEqual({
    ok: false,
    status: 403,
    message: 'Insufficient portal role',
  })
})

test('super_admin → ok', () => {
  expect(checkSuperAdmin({ portalRole: 'super_admin' })).toEqual({ ok: true })
})

test('unknown role string → 403', () => {
  expect(checkSuperAdmin({ portalRole: 'maintainer' })).toEqual({
    ok: false,
    status: 403,
    message: 'Insufficient portal role',
  })
})

test('authUser with missing portalRole → 403', () => {
  expect(checkSuperAdmin({})).toEqual({
    ok: false,
    status: 403,
    message: 'Insufficient portal role',
  })
})
