/**
 * Admin email management — PR D of Spec 06.
 *
 * Mirrors services/me-emails.ts but with admin posture:
 *   - addedBy = 'admin'
 *   - verifiedAt = NOW() at insert (Q4b/c — admin-entered emails are trusted)
 *   - collision response REVEALS the target user (admin needs to resolve)
 *   - workspace-kind add/edit/remove allowed
 *
 * Routes call these helpers; route handlers attach audit log entries.
 */

import { db } from '~/db'
import { and, eq, isNotNull, ne } from 'drizzle-orm'
import { identityUserEmails } from '~/db/schema/identity-user-emails'
import { identityUsers } from '~/db/schema/identity-users'

export type AdminAddEmailResult =
  | { outcome: 'added'; emailId: string; isPrimary: boolean }
  | {
      outcome: 'email_in_use'
      collisionUserId: string
      collisionUserName: string
    }
  | { outcome: 'target_user_not_found' }

export type AdminEditEmailResult =
  | { outcome: 'updated' }
  | { outcome: 'email_not_found' }
  | { outcome: 'wrong_target_user' }
  | {
      outcome: 'email_in_use'
      collisionUserId: string
      collisionUserName: string
    }
  | { outcome: 'not_verified' } // for set-primary

export type AdminRemoveEmailResult =
  | { outcome: 'removed' }
  | { outcome: 'email_not_found' }
  | { outcome: 'wrong_target_user' }
  | { outcome: 'last_verified_email' }

async function lookupCollision(emailNormalized: string, exceptId?: string) {
  const rows = await db
    .select({
      id: identityUserEmails.id,
      identityUserId: identityUserEmails.identityUserId,
    })
    .from(identityUserEmails)
    .where(eq(identityUserEmails.emailNormalized, emailNormalized))
    .limit(1)
  const row = rows[0]
  if (!row || row.id === exceptId) return null
  const userRows = await db
    .select({ id: identityUsers.id, name: identityUsers.name })
    .from(identityUsers)
    .where(eq(identityUsers.id, row.identityUserId))
    .limit(1)
  const user = userRows[0]
  return {
    collisionRowId: row.id,
    collisionUserId: row.identityUserId,
    collisionUserName: user?.name ?? '(unknown)',
  }
}

/**
 * Insert a row on a target user. Per Q4b/c, admin-entered emails are trusted —
 * verifiedAt defaults to NOW(). The first email on a user becomes primary; if
 * a workspace email is added when only personal emails exist, it takes primary
 * (Q8a precedence). Caller is responsible for the audit-log entry.
 */
export async function adminAddEmailToUser(args: {
  targetIdentityUserId: string
  email: string
  kind: 'workspace' | 'personal'
}): Promise<AdminAddEmailResult> {
  const emailNormalized = args.email.toLowerCase().trim()

  const target = await db
    .select({ id: identityUsers.id })
    .from(identityUsers)
    .where(eq(identityUsers.id, args.targetIdentityUserId))
    .limit(1)
  if (target.length === 0) return { outcome: 'target_user_not_found' }

  const collision = await lookupCollision(emailNormalized)
  if (collision) {
    return {
      outcome: 'email_in_use',
      collisionUserId: collision.collisionUserId,
      collisionUserName: collision.collisionUserName,
    }
  }

  const existing = await db
    .select({
      id: identityUserEmails.id,
      kind: identityUserEmails.kind,
      isPrimary: identityUserEmails.isPrimary,
    })
    .from(identityUserEmails)
    .where(eq(identityUserEmails.identityUserId, args.targetIdentityUserId))

  const hasAny = existing.length > 0
  const hasWorkspace = existing.some((r) => r.kind === 'workspace')
  // Q8a precedence: workspace > personal. The new row becomes primary if:
  //   - the user has no rows yet, OR
  //   - a workspace email is being added and none exists yet
  const shouldBePrimary = !hasAny || (args.kind === 'workspace' && !hasWorkspace)

  const now = new Date()
  const id = await db.transaction(async (tx) => {
    if (shouldBePrimary && hasAny) {
      // Demote prior primary first to satisfy the partial unique index.
      await tx
        .update(identityUserEmails)
        .set({ isPrimary: false, updatedAt: now })
        .where(
          and(
            eq(identityUserEmails.identityUserId, args.targetIdentityUserId),
            eq(identityUserEmails.isPrimary, true),
          ),
        )
    }
    const inserted = await tx
      .insert(identityUserEmails)
      .values({
        identityUserId: args.targetIdentityUserId,
        email: args.email,
        emailNormalized,
        kind: args.kind,
        isPrimary: shouldBePrimary,
        verifiedAt: now, // Q4b/c — admin-trusted on entry
        addedBy: 'admin',
      })
      .returning({ id: identityUserEmails.id })
    return inserted[0]!.id
  })

  return { outcome: 'added', emailId: id, isPrimary: shouldBePrimary }
}

/**
 * Update an email's address value. Admin-trusted: verifiedAt stays as-is
 * (or is set to NOW() — caller decides). Collision check excludes the row
 * being edited.
 */
export async function adminEditEmailAddress(args: {
  targetIdentityUserId: string
  emailId: string
  newEmail: string
}): Promise<AdminEditEmailResult> {
  const rows = await db
    .select()
    .from(identityUserEmails)
    .where(eq(identityUserEmails.id, args.emailId))
    .limit(1)
  const row = rows[0]
  if (!row) return { outcome: 'email_not_found' }
  if (row.identityUserId !== args.targetIdentityUserId) {
    return { outcome: 'wrong_target_user' }
  }

  const newNormalized = args.newEmail.toLowerCase().trim()
  if (newNormalized === row.emailNormalized) {
    return { outcome: 'updated' }
  }
  const collision = await lookupCollision(newNormalized, args.emailId)
  if (collision) {
    return {
      outcome: 'email_in_use',
      collisionUserId: collision.collisionUserId,
      collisionUserName: collision.collisionUserName,
    }
  }

  await db
    .update(identityUserEmails)
    .set({
      email: args.newEmail,
      emailNormalized: newNormalized,
      // Edits keep verifiedAt — the address change is admin-trusted, the row stays verified.
      verifiedAt: row.verifiedAt ?? new Date(),
      updatedAt: new Date(),
    })
    .where(eq(identityUserEmails.id, args.emailId))
  return { outcome: 'updated' }
}

export async function adminSetEmailPrimary(args: {
  targetIdentityUserId: string
  emailId: string
}): Promise<AdminEditEmailResult> {
  const rows = await db
    .select()
    .from(identityUserEmails)
    .where(eq(identityUserEmails.id, args.emailId))
    .limit(1)
  const row = rows[0]
  if (!row) return { outcome: 'email_not_found' }
  if (row.identityUserId !== args.targetIdentityUserId) {
    return { outcome: 'wrong_target_user' }
  }
  if (row.verifiedAt === null) return { outcome: 'not_verified' }
  if (row.isPrimary) return { outcome: 'updated' }

  const now = new Date()
  await db.transaction(async (tx) => {
    await tx
      .update(identityUserEmails)
      .set({ isPrimary: false, updatedAt: now })
      .where(
        and(
          eq(identityUserEmails.identityUserId, args.targetIdentityUserId),
          eq(identityUserEmails.isPrimary, true),
        ),
      )
    await tx
      .update(identityUserEmails)
      .set({ isPrimary: true, updatedAt: now })
      .where(eq(identityUserEmails.id, args.emailId))
  })
  return { outcome: 'updated' }
}

/**
 * Hard-delete with last-verified guard. Admin can remove workspace-kind rows
 * (unlike self-service). The DELETE trigger populates _history with
 * removedReason='admin_action' (or 'collision_resolve' if caller signals).
 */
export async function adminRemoveEmail(args: {
  targetIdentityUserId: string
  emailId: string
}): Promise<AdminRemoveEmailResult> {
  const rows = await db
    .select()
    .from(identityUserEmails)
    .where(eq(identityUserEmails.id, args.emailId))
    .limit(1)
  const row = rows[0]
  if (!row) return { outcome: 'email_not_found' }
  if (row.identityUserId !== args.targetIdentityUserId) {
    return { outcome: 'wrong_target_user' }
  }

  if (row.verifiedAt !== null) {
    const otherVerified = await db
      .select({ id: identityUserEmails.id })
      .from(identityUserEmails)
      .where(
        and(
          eq(identityUserEmails.identityUserId, args.targetIdentityUserId),
          isNotNull(identityUserEmails.verifiedAt),
          ne(identityUserEmails.id, args.emailId),
        ),
      )
      .limit(1)
    if (otherVerified.length === 0) return { outcome: 'last_verified_email' }
  }

  await db.delete(identityUserEmails).where(eq(identityUserEmails.id, args.emailId))
  return { outcome: 'removed' }
}
