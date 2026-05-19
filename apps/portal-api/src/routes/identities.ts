/**
 * POST /v1/identities — Spec 06 PR F admin-side affordance.
 *
 * Sibling to /v1/employees. Creates a lean password-only identity. No `kind`
 * field on the wire — service hard-codes `'personal'` per spec §2.
 *
 * Errors map:
 *   400 — body invalid (Elysia validation) OR weak password
 *   403 — caller is not admin (handled by requireRole middleware)
 *   409 — email already registered
 *   500 — unexpected (caught by global handler)
 */

import { Elysia, t } from 'elysia'
import { eq } from 'drizzle-orm'
import { db } from '~/db'
import { identityUsers, identityUserEmails } from '~/db/schema'
import { requireRole } from '../middleware/rbac'
import {
  createIdentityWithPassword,
  WeakPasswordError,
  DuplicateEmailError,
} from '../services/identities'
import { logAudit } from '../services/audit'

export const identityRoutes = new Elysia({ prefix: '/identities' })
  .use(requireRole('admin'))

  /**
   * GET /v1/identities — admin list of password-only identities.
   *
   * Filtered by `password_only_auth = TRUE` so the surface only shows admin-
   * created credential bags. Workspace + personal-only employees live under
   * /v1/employees.
   */
  .get(
    '/',
    async () => {
      const rows = await db
        .select({
          id: identityUsers.id,
          name: identityUsers.name,
          gipUid: identityUsers.gipUid,
          status: identityUsers.status,
          notes: identityUsers.notes,
          passwordSetAt: identityUsers.passwordSetAt,
          createdAt: identityUsers.createdAt,
        })
        .from(identityUsers)
        .where(eq(identityUsers.passwordOnlyAuth, true))

      const emails = rows.length === 0
        ? []
        : await db
            .select({
              identityUserId: identityUserEmails.identityUserId,
              email: identityUserEmails.email,
            })
            .from(identityUserEmails)
            .where(eq(identityUserEmails.isPrimary, true))

      const emailByUser = new Map(emails.map((e) => [e.identityUserId, e.email]))

      return {
        identities: rows.map((r) => ({
          id: r.id,
          name: r.name,
          email: emailByUser.get(r.id) ?? null,
          gipUid: r.gipUid,
          status: r.status,
          notes: r.notes,
          passwordSetAt: r.passwordSetAt?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
        })),
      }
    },
    {
      response: {
        200: t.Object({
          identities: t.Array(
            t.Object({
              id: t.String(),
              name: t.String(),
              email: t.Union([t.String(), t.Null()]),
              gipUid: t.Union([t.String(), t.Null()]),
              status: t.String(),
              notes: t.Union([t.String(), t.Null()]),
              passwordSetAt: t.Union([t.String(), t.Null()]),
              createdAt: t.String(),
            }),
          ),
        }),
      },
    },
  )

  .post(
    '/',
    async ({ body, authUser, requestId, actorIp, set }) => {
      try {
        const result = await createIdentityWithPassword({
          name: body.name,
          email: body.email,
          password: body.password,
          notes: body.notes,
        })

        await logAudit({
          actorId: authUser.id,
          action: 'create_identity_with_password',
          targetType: 'user',
          targetId: result.id,
          details: {
            email: body.email,
            kind: 'personal',
            notes: body.notes ?? null,
          },
          requestId,
          actorIp,
        })

        return { id: result.id, gipUid: result.gipUid, provisioningStatus: 'ready' as const }
      } catch (err) {
        if (err instanceof WeakPasswordError) {
          set.status = 400
          return { error: 'WEAK_PASSWORD' as const, message: err.reason }
        }
        if (err instanceof DuplicateEmailError) {
          set.status = 409
          return { error: 'DUPLICATE_EMAIL' as const, message: err.message }
        }
        throw err
      }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 255 }),
        email: t.String({ format: 'email', maxLength: 255 }),
        password: t.String({ minLength: 1, maxLength: 256 }),
        notes: t.Optional(t.String({ maxLength: 2000 })),
      }),
      response: {
        200: t.Object({
          id: t.String(),
          gipUid: t.String(),
          provisioningStatus: t.Literal('ready'),
        }),
        400: t.Object({ error: t.Literal('WEAK_PASSWORD'), message: t.String() }),
        409: t.Object({ error: t.Literal('DUPLICATE_EMAIL'), message: t.String() }),
      },
    },
  )
