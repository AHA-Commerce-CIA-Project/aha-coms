/**
 * Identities service — Spec 06 PR F.
 *
 * Sibling to `employees.ts`. Where employees.createEmployee builds a fully-
 * provisioned org member (workspace + personal emails, GIP user with random
 * password + reset-link email, team membership, etc), createIdentityWithPassword
 * builds a lean "credential bag" identity:
 *
 *   - `kind = 'personal'` always (hard-coded; no wire field)
 *   - `password_only_auth = TRUE`  → OTP refuses; forgot-password refuses
 *   - `password_set_at = now()`     → first-login forced-set skips this user
 *   - admin-supplied password lands verbatim in GIP (no reset dance)
 *   - team-membership seeding skipped — no `teamId` on /v1/identities
 *   - provisioningStatus stays `'ready'` (default) — admin-created identities
 *     are immediately usable
 *
 * Post-tx fanout matches `createEmployee`:
 *   - `seedAppUserConfigForUser` runs in-tx (so the app_user_config rows are
 *     visible to anything that reads after commit)
 *   - `emitUserProvisioned` fires-and-forgets webhooks
 */

import { db } from '~/db'
import { identityUsers, identityUserEmails } from '~/db/schema'
import type { NewIdentityUser } from '~/db/schema'
import { createGipUser } from '../gip-admin'
import { seedAppUserConfigForUser } from './app-user-config'
import { emitUserProvisioned } from './provisioning-events'
import { validateMinimum } from './password-policy'
import { logger } from '~/logger'

export type CreateIdentityWithPasswordInput = {
  name: string
  email: string
  password: string
  notes?: string
}

export type CreateIdentityWithPasswordResult = {
  id: string
  gipUid: string
}

export class WeakPasswordError extends Error {
  constructor(public reason: string) {
    super(reason)
    this.name = 'WeakPasswordError'
  }
}

export class DuplicateEmailError extends Error {
  constructor(email: string) {
    super(`Email ${email} is already registered`)
    this.name = 'DuplicateEmailError'
  }
}

/**
 * Create a password-only identity. Validates the password against the policy
 * before calling GIP. Rolls back the local identity_users row if any post-GIP
 * step fails — GIP-side cleanup is best-effort (we log and move on; the
 * orphaned GIP user is harmless until the next attempt with the same email,
 * which will collide; tracked as carryover).
 */
export async function createIdentityWithPassword(
  input: CreateIdentityWithPasswordInput,
): Promise<CreateIdentityWithPasswordResult> {
  const policy = validateMinimum(input.password)
  if (!policy.ok) {
    throw new WeakPasswordError(policy.reason)
  }

  const emailNormalized = input.email.toLowerCase().trim()

  // Pre-check duplicate to avoid wasting a GIP create on a known collision.
  // The unique index on identity_user_emails.email_normalized is the real guard.
  const existing = await db.query.identityUserEmails.findFirst({
    where: (t, { eq }) => eq(t.emailNormalized, emailNormalized),
    columns: { id: true },
  })
  if (existing) {
    throw new DuplicateEmailError(input.email)
  }

  // Create GIP user first — if GIP rejects (e.g. email already exists in GIP
  // from a prior orphaned attempt) we never insert a local row.
  const gipUid = await createGipUser(input.email, input.password)

  try {
    const result = await db.transaction(async (tx) => {
      const now = new Date()
      const [inserted] = await tx
        .insert(identityUsers)
        .values({
          name: input.name,
          gipUid,
          portalRole: 'employee',
          source: 'manual',
          hasGoogleWorkspace: false,
          provisioningStatus: 'ready',
          notes: input.notes ?? null,
          passwordSetAt: now,
          passwordOnlyAuth: true,
        } satisfies Omit<NewIdentityUser, 'id' | 'createdAt' | 'updatedAt'>)
        .returning({ id: identityUsers.id })

      if (!inserted) {
        throw new Error('identity_users insert returned no row')
      }

      await tx.insert(identityUserEmails).values({
        identityUserId: inserted.id,
        email: input.email,
        emailNormalized,
        kind: 'personal',
        isPrimary: true,
        verifiedAt: now,
        addedBy: 'admin',
      })

      await seedAppUserConfigForUser(tx, inserted.id)

      return inserted
    })

    // Fire-and-forget: webhook fanout. No await — does not block the response.
    emitUserProvisioned(result.id).catch((err) => {
      logger.error(
        { err, userId: result.id },
        '[identities] emitUserProvisioned failed',
      )
    })

    return { id: result.id, gipUid }
  } catch (err) {
    logger.error(
      { err, email: input.email, gipUid },
      '[identities] post-GIP insert failed; GIP user is orphaned',
    )
    throw err
  }
}
