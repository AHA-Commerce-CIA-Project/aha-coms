/**
 * Portal-side app-role values (per spec07-register-fast.ts's
 * configSchema) are `'employee' | 'leader' | 'admin'`. Fast's User
 * model historically used `'member' | 'leader'`, and use-auth.tsx
 * derives `isLeader = role === 'leader' || role === 'admin'` plus
 * `isMaster = role === 'admin'` — so 'admin' is already a value fast
 * understands, while 'employee' is not.
 *
 * Normalise 'employee' → 'member' so the column's existing values
 * stay consistent with fast's local admin tooling
 * (scripts/set-admin.ts, scripts/set-leader.ts). Pass 'leader' and
 * 'admin' through verbatim. Unknown values return null so the caller
 * can skip the update rather than corrupt the column.
 */
export function mapPortalRoleToFastRole(portalRole: unknown): string | null {
  if (typeof portalRole !== 'string') return null
  if (portalRole === 'leader' || portalRole === 'admin') return portalRole
  if (portalRole === 'employee' || portalRole === 'member') return 'member'
  return null
}
