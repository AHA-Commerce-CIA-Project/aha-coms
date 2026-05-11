/**
 * Bootstrap the seeded team + access grants the heroes smoke needs.
 *
 * Companion to `register-heroes.ts` (which only registers heroes in the
 * App Registry). The portal's launcher derives an app's visibility from
 * `team_app_access` (see `apps/portal-api/src/middleware/auth.ts:resolveAuthUser`),
 * so the bootstrap admin needs:
 *
 *   1. a seeded team
 *   2. a team_members row joining the admin to that team
 *   3. a team_app_access row granting the team access to heroes
 *   4. a member_app_role row recording the admin's per-app role
 *
 * All four are idempotent — re-running the script logs the existing state and
 * makes no destructive change.
 *
 * Runbook (dev):
 *   DATABASE_URL=postgresql://aha_sicu@localhost:5432/coms_portal \
 *   BOOTSTRAP_ADMIN_EMAIL=handers.the@ahacommerce.net \
 *   bun run --cwd apps/portal-api bootstrap:heroes-membership
 *
 * Optional env:
 *   SEEDED_TEAM_NAME=Engineering        # default
 *   BOOTSTRAP_HEROES_ROLE=admin         # default; must be one of heroes' app_roles
 *
 * Prerequisite: `register:heroes` must have run first (heroes must exist in
 * app_registry). And the bootstrap admin must already exist in identity_users
 * — either via `db:seed-admin` or via a real sign-in.
 *
 * Note on `heroes_profiles.role`: granting `member_app_role` in portal does
 * NOT, by itself, populate heroes' own profile-side role column. In production
 * the `user.provisioned` webhook carries the appRole over to heroes and
 * heroes' `handle-user-provisioned.ts` writes `heroes_profiles.role`. Heroes'
 * webhook receiver verifies inbound requests via a Google ID token signed by
 * portal's GCP service account — heavy to reproduce in local dev. This script
 * therefore stops short of firing the webhook and logs the gap explicitly.
 * Until heroes-api grows a dev-mode bypass (or a real SA JSON is wired into
 * portal locally), the admin UI in heroes will remain dark even after this
 * script runs successfully; the sign-in + launcher visibility smoke that T15
 * verified is unaffected. See Finding 3 in `tasks/todo.md`.
 */
import { db } from '~/db'
import {
  appRegistry,
  identityUsers,
  identityUserEmails,
  memberAppRole,
  teamAppAccess,
  teamMembers,
  teams,
} from '~/db/schema'
import { and, eq } from 'drizzle-orm'

const SLUG = 'heroes'

function requiredEnv(key: string): string {
  const v = process.env[key]
  if (!v || v.trim().length === 0) {
    throw new Error(`Missing required env: ${key}`)
  }
  return v.trim()
}

function optionalEnv(key: string, fallback: string): string {
  const v = process.env[key]
  return v && v.trim().length > 0 ? v.trim() : fallback
}

async function main() {
  const adminEmail = requiredEnv('BOOTSTRAP_ADMIN_EMAIL').toLowerCase()
  const teamName = optionalEnv('SEEDED_TEAM_NAME', 'Engineering')
  const heroesRole = optionalEnv('BOOTSTRAP_HEROES_ROLE', 'admin')

  await db.transaction(async (tx) => {
    // Resolve the bootstrap admin via their email row.
    const [emailRow] = await tx
      .select({ userId: identityUserEmails.identityUserId })
      .from(identityUserEmails)
      .where(eq(identityUserEmails.emailNormalized, adminEmail))
      .limit(1)
    if (!emailRow) {
      throw new Error(
        `[bootstrap-heroes-membership] No identity_user_emails row for ${adminEmail}. ` +
          `Run db:seed-admin first, or sign in once to provision the identity.`,
      )
    }
    const userId = emailRow.userId

    const [user] = await tx
      .select({ id: identityUsers.id, name: identityUsers.name })
      .from(identityUsers)
      .where(eq(identityUsers.id, userId))
      .limit(1)
    if (!user) {
      throw new Error(
        `[bootstrap-heroes-membership] identity_users row ${userId} missing despite email link.`,
      )
    }
    console.log(`[bootstrap-heroes-membership] Admin: ${user.name} (id=${userId})`)

    // Resolve heroes' app id (register:heroes must have already run).
    const [heroesApp] = await tx
      .select({ id: appRegistry.id })
      .from(appRegistry)
      .where(eq(appRegistry.slug, SLUG))
      .limit(1)
    if (!heroesApp) {
      throw new Error(
        `[bootstrap-heroes-membership] No app_registry row for slug=${SLUG}. ` +
          `Run register:heroes first.`,
      )
    }
    const heroesAppId = heroesApp.id
    console.log(`[bootstrap-heroes-membership] Heroes app id: ${heroesAppId}`)

    // 1. Seeded team — teams.name has no unique index, so SELECT first.
    let [team] = await tx
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.name, teamName))
      .limit(1)
    if (!team) {
      ;[team] = await tx
        .insert(teams)
        .values({
          name: teamName,
          description: 'Default dev team for the heroes integration smoke.',
        })
        .returning({ id: teams.id })
      console.log(`[bootstrap-heroes-membership] Inserted team "${teamName}" (id=${team.id})`)
    } else {
      console.log(`[bootstrap-heroes-membership] Team "${teamName}" already exists (id=${team.id})`)
    }
    const teamId = team.id

    // 2. team_members — unique on (team_id, user_id).
    const tmInserted = await tx
      .insert(teamMembers)
      .values({ teamId, userId, roleInTeam: 'admin' })
      .onConflictDoNothing()
      .returning({ id: teamMembers.id })
    console.log(
      tmInserted.length > 0
        ? `[bootstrap-heroes-membership] Added admin to team "${teamName}"`
        : `[bootstrap-heroes-membership] Admin already a member of team "${teamName}"`,
    )

    // 3. team_app_access — unique on (team_id, app_id).
    const taaInserted = await tx
      .insert(teamAppAccess)
      .values({ teamId, appId: heroesAppId, grantedBy: userId })
      .onConflictDoNothing()
      .returning({ id: teamAppAccess.id })
    console.log(
      taaInserted.length > 0
        ? `[bootstrap-heroes-membership] Granted team "${teamName}" access to heroes`
        : `[bootstrap-heroes-membership] Team "${teamName}" already has heroes access`,
    )

    // 4. member_app_role — unique on (user_id, app_id).
    const marInserted = await tx
      .insert(memberAppRole)
      .values({ userId, appId: heroesAppId, appRole: heroesRole, grantedBy: userId })
      .onConflictDoNothing()
      .returning({ id: memberAppRole.id })
    if (marInserted.length > 0) {
      console.log(
        `[bootstrap-heroes-membership] Recorded heroes role "${heroesRole}" for admin`,
      )
    } else {
      // Refresh role if already present and value differs.
      const [existing] = await tx
        .select({ appRole: memberAppRole.appRole })
        .from(memberAppRole)
        .where(and(eq(memberAppRole.userId, userId), eq(memberAppRole.appId, heroesAppId)))
        .limit(1)
      if (existing && existing.appRole !== heroesRole) {
        await tx
          .update(memberAppRole)
          .set({ appRole: heroesRole })
          .where(and(eq(memberAppRole.userId, userId), eq(memberAppRole.appId, heroesAppId)))
        console.log(
          `[bootstrap-heroes-membership] Updated heroes role from "${existing.appRole}" to "${heroesRole}"`,
        )
      } else {
        console.log(
          `[bootstrap-heroes-membership] Heroes role "${heroesRole}" already set for admin`,
        )
      }
    }
  })

  console.log('')
  console.log(
    '[bootstrap-heroes-membership] NOTE: heroes_profiles.role on the heroes side is NOT written by this script.',
  )
  console.log(
    '  Production fills it via the `user.provisioned` webhook, which heroes verifies with a Google ID',
  )
  console.log(
    '  token signed by portal\'s GCP service account. Local dev needs either a real SA JSON wired into',
  )
  console.log(
    '  portal or a dev-mode bypass in heroes-api\'s webhook handler. Sign-in + launcher visibility work',
  )
  console.log(
    '  without it; the admin UI in heroes stays dark until that gap closes. See Finding 3 in tasks/todo.md.',
  )
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('[bootstrap-heroes-membership] Failed:', err)
    process.exit(1)
  },
)
