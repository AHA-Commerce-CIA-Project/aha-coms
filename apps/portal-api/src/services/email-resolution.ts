import { db } from '~/db'
import { identityUserEmails } from '~/db/schema'
import { eq, inArray } from 'drizzle-orm'
import { asc } from 'drizzle-orm'
import type { UserEmailEntry, UserEmailKind, UserEmailAddedBy } from '@coms-portal/shared'

/**
 * Resolve a user's display email per Q8a precedence:
 *   1. The workspace email (kind='workspace') if it exists.
 *   2. Else the primary personal email (kind='personal' AND isPrimary=true).
 *   3. Else the first personal email by createdAt.
 *   4. Else null (user has no emails — only possible mid-flight; should be rare).
 */
export async function getDisplayEmail(identityUserId: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(identityUserEmails)
    .where(eq(identityUserEmails.identityUserId, identityUserId))
    .orderBy(asc(identityUserEmails.createdAt))

  if (rows.length === 0) return null
  const workspace = rows.find((r) => r.kind === 'workspace')
  if (workspace) return workspace.email
  const primary = rows.find((r) => r.kind === 'personal' && r.isPrimary)
  if (primary) return primary.email
  return rows.find((r) => r.kind === 'personal')?.email ?? null
}

/**
 * Resolve the full emails array for /userinfo and webhook payloads.
 * Shape matches `UserEmailEntry` from `@coms-portal/shared` v1.5.0+.
 */
export async function getEmailEntries(identityUserId: string): Promise<UserEmailEntry[]> {
  const rows = await db
    .select()
    .from(identityUserEmails)
    .where(eq(identityUserEmails.identityUserId, identityUserId))
    .orderBy(asc(identityUserEmails.createdAt))

  return rows.map((r) => ({
    address: r.email,
    kind: r.kind as UserEmailKind,
    isPrimary: r.isPrimary,
    verified: r.verifiedAt !== null,
    addedBy: r.addedBy as UserEmailAddedBy,
  }))
}

/**
 * Same shape as getEmailEntries but with the row id attached. The id is needed
 * by /api/userinfo so the profile-management UI can call PATCH/DELETE without
 * a second round-trip; it is NOT included in webhook payloads (UserEmailEntry
 * is the cross-app shape) — admin-managed identifiers do not leak to H-apps.
 */
export interface UserEmailEntryWithId extends UserEmailEntry {
  emailId: string
}

/**
 * Batch variant of getDisplayEmail — resolves the Q8a display email for each
 * userId in one query.  Returns a Map<userId, string | null>; users with no
 * email row map to null.
 */
export async function getDisplayEmailsForUsers(
  identityUserIds: string[],
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>(identityUserIds.map((id) => [id, null]))
  if (identityUserIds.length === 0) return map

  const rows = await db
    .select()
    .from(identityUserEmails)
    .where(inArray(identityUserEmails.identityUserId, identityUserIds))
    .orderBy(asc(identityUserEmails.createdAt))

  // Group rows by userId, then apply the same Q8a precedence as getDisplayEmail
  const grouped = new Map<string, typeof rows>()
  for (const row of rows) {
    const bucket = grouped.get(row.identityUserId) ?? []
    bucket.push(row)
    grouped.set(row.identityUserId, bucket)
  }

  for (const [userId, userRows] of grouped) {
    const workspace = userRows.find((r) => r.kind === 'workspace')
    if (workspace) { map.set(userId, workspace.email); continue }
    const primary = userRows.find((r) => r.kind === 'personal' && r.isPrimary)
    if (primary) { map.set(userId, primary.email); continue }
    map.set(userId, userRows.find((r) => r.kind === 'personal')?.email ?? null)
  }

  return map
}

export async function getEmailEntriesWithIds(
  identityUserId: string,
): Promise<UserEmailEntryWithId[]> {
  const rows = await db
    .select()
    .from(identityUserEmails)
    .where(eq(identityUserEmails.identityUserId, identityUserId))
    .orderBy(asc(identityUserEmails.createdAt))

  return rows.map((r) => ({
    emailId: r.id,
    address: r.email,
    kind: r.kind as UserEmailKind,
    isPrimary: r.isPrimary,
    verified: r.verifiedAt !== null,
    addedBy: r.addedBy as UserEmailAddedBy,
  }))
}
