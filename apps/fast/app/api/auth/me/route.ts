/**
 * GET /api/auth/me — client-side identity resolution endpoint.
 *
 * Spec 05 Phase 3 / T61 — sub-phase (b).
 *
 * Replaces the Better Auth client `useSession()` / `authClient.getSession()`
 * round trip with a portal-rooted shape. Client components stay
 * unchanged: `useAuth()` (lib/auth-context.tsx) fetches this route,
 * caches the result in React state, and exposes the same
 * `{ user, profile, isLeader, isMaster, loading, signOut }` shape the
 * 26 client-side consumers read today.
 *
 * Returns:
 *   200 { user: AuthUser, profile: { team_id, team_name, avatar_url }, appCatalog: AppCatalogEntry[] }
 *   401 { error: 'Unauthorized' }
 *
 * `appCatalog` lands as part of T74's chrome wiring — the cross-app
 * launcher list from portal-api's /api/userinfo flows through here
 * to the client-side useAuth() context so the TopNav's cross-app
 * pills render the same set of apps everywhere without an extra
 * round trip. (Pre-2026-05-15 the consumers were the SuiteServiceBar
 * strip + the shared AccountWidget; both were folded into TopNav by
 * PR #6's header consolidation.)
 *
 * The `profile` envelope mirrors the legacy `/api/profile` response so
 * the auth-context's "supplement with profile API for custom fields"
 * pass collapses into one round trip instead of two. The custom fields
 * (`avatar_url`, `team_name`) are populated server-side from fast's
 * own Prisma row + team join.
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireFastAuth } from '@/lib/auth/require-fast-auth'

export async function GET() {
  const session = await requireFastAuth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const profileRow = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      teamId: true,
      image: true,
      team: { select: { name: true } },
    },
  })

  return NextResponse.json({
    user: session.user,
    profile: {
      team_id: profileRow?.teamId ?? null,
      team_name: profileRow?.team?.name ?? null,
      avatar_url: profileRow?.image ?? session.user.image,
    },
    appCatalog: session.appCatalog,
  })
}
