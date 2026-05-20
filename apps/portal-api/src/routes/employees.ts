import { Elysia, t } from 'elysia'
import { db } from '~/db'
import { identityUsers, identityUserEmails } from '~/db/schema'
import { eq, ilike, or, and, sql, inArray } from 'drizzle-orm'
import { requireRole } from '../middleware/rbac'
import { generatePasswordResetLink, updateGipUserEmail } from '../gip-admin'
import { createEmployee, deactivateEmployee, batchUpdateEmployees } from '../services/employees'
import { importEmployeesFromGoogleAdminCsv } from '../services/employee-import'
import { processEmployeeProvisioning } from '../services/employee-provisioning'
import { logAudit } from '../services/audit'
import { revokeAllSessionsForUser } from '../services/sessions'
import { authSessions } from '~/db/schema'
import { isNull } from 'drizzle-orm'
import {
  issueOneTimeLoginLink,
  listOneTimeLoginLinksForUser,
} from '../services/one-time-login-links'
import { ONE_TIME_LOGIN_LINK_REASONS } from '~/db/schema/one-time-login-links'
import { checkSuperAdmin } from '../middleware/rbac'
import { emitUserUpdated } from '../services/provisioning-events'
import { emitEmploymentUpdated } from '../services/taxonomy-events'
import {
  getEmploymentBlock,
  diffEmployment,
  hasHrFieldChanges,
} from '../services/employment-resolution'
import { getDisplayEmail, getDisplayEmailsForUsers } from '../services/email-resolution'
import {
  adminAddEmailToUser,
  adminEditEmailAddress,
  adminSetEmailPrimary,
  adminRemoveEmail,
} from '../services/admin-emails'
import { logger } from '~/logger'

// Per Q4a: both workspaceEmail and personalEmail are optional; at least one required.
// The old `email` field mapped to workspace email. It is renamed here for clarity.
// For PR D, the PATCH endpoint's email-management moves to the profile/admin-detail surface.
const employeeBody = t.Object({
  workspaceEmail: t.Optional(t.String({ format: 'email' })),
  personalEmail: t.Optional(t.String({ format: 'email' })),
  name: t.String({ minLength: 1 }),
  phone: t.Optional(t.String()),
  department: t.Optional(t.String()),
  position: t.Optional(t.String()),
  branch: t.Optional(t.Union([t.Literal('Indonesia'), t.Literal('Thailand')])),
  portalRole: t.Optional(
    t.Union([t.Literal('employee'), t.Literal('admin')]),
  ),
  teamId: t.Optional(t.String()),
  hasGoogleWorkspace: t.Optional(t.Boolean()),

  birthDate: t.Optional(t.String()),
  leaderName: t.Optional(t.String()),
})

export const employeeRoutes = new Elysia({ prefix: '/employees' })
  .use(requireRole('admin'))

  .get(
    '/',
    async ({ query }) => {
      const page = Number(query.page ?? 1)
      const limit = Number(query.limit ?? 20)
      const offset = (page - 1) * limit

      // Search by name or by email (via identity_user_emails subquery)
      let where: ReturnType<typeof ilike> | undefined
      if (query.search) {
        // Name search only in list view — email search is handled by /search
        where = ilike(identityUsers.name, `%${query.search}%`)
      }

      const [rows, [{ count }]] = await Promise.all([
        db
          .select({
            id: identityUsers.id,
            name: identityUsers.name,
            phone: identityUsers.phone,
            department: identityUsers.department,
            position: identityUsers.position,
            branch: identityUsers.branch,

            birthDate: identityUsers.birthDate,
            leaderName: identityUsers.leaderName,
            portalRole: identityUsers.portalRole,
            status: identityUsers.status,
            hasGoogleWorkspace: identityUsers.hasGoogleWorkspace,
            provisioningStatus: identityUsers.provisioningStatus,
            createdAt: identityUsers.createdAt,
            updatedAt: identityUsers.updatedAt,
          })
          .from(identityUsers)
          .where(where)
          .limit(limit)
          .offset(offset),
        db.select({ count: sql<number>`count(*)` }).from(identityUsers).where(where),
      ])

      // Attach emails per row so the list view can render kind badges and the
      // primary address without a per-row userinfo round-trip. Single query
      // bulk-resolves all rows on this page.
      const ids = rows.map((r) => r.id)
      const emailRows = ids.length
        ? await db
            .select()
            .from(identityUserEmails)
            .where(inArray(identityUserEmails.identityUserId, ids))
        : []
      const emailsByUser = new Map<string, typeof emailRows>()
      for (const e of emailRows) {
        const list = emailsByUser.get(e.identityUserId) ?? []
        list.push(e)
        emailsByUser.set(e.identityUserId, list)
      }
      const data = rows.map((r) => ({
        ...r,
        emails: (emailsByUser.get(r.id) ?? []).map((e) => ({
          emailId: e.id,
          address: e.email,
          kind: e.kind,
          isPrimary: e.isPrimary,
          verified: e.verifiedAt !== null,
          addedBy: e.addedBy,
        })),
      }))
      return { data, total: Number(count), page, limit }
    },
    {
      query: t.Object({
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        search: t.Optional(t.String()),
      }),
      response: {
        200: t.Object({
          data: t.Array(t.Any()),
          total: t.Number(),
          page: t.Number(),
          limit: t.Number(),
        }),
      },
    },
  )

  .get(
    '/search',
    async ({ query }) => {
      const q = query.q.trim()
      if (q.length < 2) return []
      const pattern = `%${q}%`
      const emailPattern = `%${q.toLowerCase()}%`

      // Find user IDs whose emails match (via identity_user_emails)
      const emailMatches = await db
        .select({ identityUserId: identityUserEmails.identityUserId })
        .from(identityUserEmails)
        .where(ilike(identityUserEmails.emailNormalized, emailPattern))

      const emailMatchIds = [...new Set(emailMatches.map((r) => r.identityUserId))]

      const users = await db
        .select({
          id: identityUsers.id,
          name: identityUsers.name,
        })
        .from(identityUsers)
        .where(
          and(
            eq(identityUsers.status, 'active'),
            or(
              ilike(identityUsers.name, pattern),
              ...(emailMatchIds.length > 0 ? [inArray(identityUsers.id, emailMatchIds)] : []),
            ),
          ),
        )
        .limit(10)

      // Attach display email per Q8a — one batched query for all results (T1.1)
      const emailMap = await getDisplayEmailsForUsers(users.map((u) => u.id))
      const results = users.map((u) => ({
        id: u.id,
        name: u.name,
        email: emailMap.get(u.id) ?? '',
      }))
      return results
    },
    {
      query: t.Object({
        q: t.String({ minLength: 2 }),
      }),
      response: {
        200: t.Array(
          t.Object({
            id: t.String(),
            name: t.String(),
            email: t.String(),
          }),
        ),
      },
    },
  )

  .post(
    '/',
    async ({ body, authUser, requestId, actorIp, set }) => {
      if (!body.workspaceEmail && !body.personalEmail) {
        set.status = 400
        return { message: 'At least one of workspaceEmail or personalEmail is required' }
      }
      const result = await createEmployee({ ...body, addedBy: 'admin' })
      await logAudit({
        actorId: authUser.id,
        action: 'create_employee',
        targetType: 'user',
        targetId: result.id,
        details: {
          workspaceEmail: body.workspaceEmail,
          personalEmail: body.personalEmail,
          provisioningStatus: result.provisioningStatus,
          ...(result.provisioningError ? { provisioningError: result.provisioningError } : {}),
        },
        requestId,
        actorIp,
      })
      return result
    },
    {
      body: employeeBody,
      response: {
        200: t.Any(),
        400: t.Object({ message: t.String() }),
      },
    },
  )

  .post(
    '/batch-update',
    async ({ body, authUser, requestId, actorIp }) => {
      const count = await batchUpdateEmployees(body.ids, body.field, body.value)

      for (const id of body.ids) {
        await logAudit({
          actorId: authUser.id,
          action: 'batch_update_employee',
          targetType: 'user',
          targetId: id,
          details: { field: body.field, value: body.value },
          requestId,
          actorIp,
        })
      }

      return { ok: true, count }
    },
    {
      body: t.Object({
        ids: t.Array(t.String(), { minItems: 1 }),
        field: t.Union([t.Literal('portalRole')]),
        value: t.String({ minLength: 1 }),
      }),
      response: {
        200: t.Object({
          ok: t.Literal(true),
          count: t.Number(),
        }),
      },
    },
  )

  .post(
    '/import-csv',
    async ({ body, authUser, requestId, actorIp }) => {
      const result = await importEmployeesFromGoogleAdminCsv(body.csv, {
        preview: body.preview,
      })

      if (!body.preview) {
        for (const createdEmployee of result.created) {
          await logAudit({
            actorId: authUser.id,
            action: 'import_employee_csv',
            targetType: 'user',
            targetId: createdEmployee.id,
            details: {
              email: createdEmployee.email,
              rowNumber: createdEmployee.rowNumber,
              source: 'google_admin_csv',
            },
            requestId,
            actorIp,
          })
        }
      }

      return result
    },
    {
      body: t.Object({
        csv: t.String({ minLength: 1 }),
        preview: t.Optional(t.Boolean()),
      }),
      response: {
        200: t.Any(),
      },
    },
  )

  .get('/:id', async ({ params, set }) => {
    const [user] = await db
      .select({
        id: identityUsers.id,
        name: identityUsers.name,
        phone: identityUsers.phone,
        department: identityUsers.department,
        position: identityUsers.position,
        branch: identityUsers.branch,
        birthDate: identityUsers.birthDate,
        leaderName: identityUsers.leaderName,
        portalRole: identityUsers.portalRole,
        status: identityUsers.status,
        hasGoogleWorkspace: identityUsers.hasGoogleWorkspace,
        provisioningStatus: identityUsers.provisioningStatus,
        provisioningError: identityUsers.provisioningError,
        createdAt: identityUsers.createdAt,
        updatedAt: identityUsers.updatedAt,
      })
      .from(identityUsers)
      .where(eq(identityUsers.id, params.id))
      .limit(1)
    if (!user) {
      set.status = 404
      return { message: 'Not found' }
    }
    // Attach email entries from identity_user_emails
    const { getEmailEntries } = await import('../services/email-resolution')
    const emails = await getEmailEntries(params.id)
    return { ...user, emails }
  }, { response: { 200: t.Any(), 404: t.Object({ message: t.String() }) } })

  .patch(
    '/:id',
    async ({ params, body, authUser, requestId, actorIp }) => {
      // TODO(PR D): email management (workspaceEmail/personalEmail changes) moves to
      // the admin user-detail and self-service profile surfaces. For PR A, only
      // non-email identity_users fields are writable via this endpoint.
      const { workspaceEmail: _ws, personalEmail: _pe, ...identityFieldsOnly } = body

      const needsExistingUser = body.portalRole !== undefined
      const existingUser = needsExistingUser
        ? await db.query.identityUsers.findFirst({ where: eq(identityUsers.id, params.id) })
        : undefined

      // Compute changedFields once — drives both emitUserUpdated and the
      // employment.updated decision below.
      const changedFields = Object.keys(identityFieldsOnly).filter(
        (k) => identityFieldsOnly[k as keyof typeof identityFieldsOnly] !== undefined,
      )

      // Spec 07 PR 07-3: capture the pre-update employment block when an HR
      // field is in the changeset. Computed BEFORE the update so the diff
      // captures the actual transition. Skipped for non-HR edits to avoid the
      // extra query.
      const hrTouched = hasHrFieldChanges(changedFields)
      const previousBlock = hrTouched ? await getEmploymentBlock(params.id) : null

      if (Object.keys(identityFieldsOnly).length > 0) {
        await db
          .update(identityUsers)
          .set({ ...identityFieldsOnly, updatedAt: new Date() })
          .where(eq(identityUsers.id, params.id))
      }

      // Claims are recomputed from DB per-request post-Q-claims; no GIP-side sync needed.

      await logAudit({
        actorId: authUser.id,
        action: 'update_employee',
        targetType: 'user',
        targetId: params.id,
        details: body.portalRole ? { portalRole: body.portalRole } : undefined,
        requestId,
        actorIp,
      })

      if (changedFields.length > 0) {
        emitUserUpdated(params.id, changedFields).catch((err) => {
          logger.error({ err, userId: params.id }, '[provisioning-events] emitUserUpdated failed')
        })
      }

      // Fire employment.updated only when HR fields actually changed value.
      // diffEmployment returns an empty delta when caller wrote a no-op
      // (e.g. position set to its current value) — we suppress the emit then.
      if (hrTouched && previousBlock) {
        try {
          const nextBlock = await getEmploymentBlock(params.id)
          if (nextBlock) {
            const { delta, previous } = diffEmployment(previousBlock, nextBlock)
            if (Object.keys(delta).length > 0) {
              emitEmploymentUpdated({
                user: { portalSub: params.id },
                employment: delta,
                previousEmployment: previous,
              }).catch((err) => {
                logger.error(
                  { err, userId: params.id },
                  '[taxonomy-events] emitEmploymentUpdated failed',
                )
              })
            }
          }
        } catch (err) {
          logger.error(
            { err, userId: params.id },
            '[taxonomy-events] employment block diff failed',
          )
        }
      }

      return { ok: true }
    },
    {
      body: t.Partial(employeeBody),
      response: {
        200: t.Object({ ok: t.Literal(true) }),
      },
    },
  )

  .delete('/:id', async ({ params, authUser, requestId, actorIp }) => {
    await deactivateEmployee(params.id)
    await logAudit({
      actorId: authUser.id,
      action: 'deactivate_employee',
      targetType: 'user',
      targetId: params.id,
      requestId,
      actorIp,
    })
    return { ok: true }
  }, { response: { 200: t.Object({ ok: t.Literal(true) }) } })

  .post('/:id/retry-provisioning', async ({ params, authUser, requestId, actorIp }) => {
    const result = await processEmployeeProvisioning(params.id)

    await logAudit({
      actorId: authUser.id,
      action: 'retry_employee_provisioning',
      targetType: 'user',
      targetId: params.id,
      details: {
        provisioningStatus: result.status,
        ...(result.error ? { provisioningError: result.error } : {}),
      },
      requestId,
      actorIp,
    })

    return result
  }, { response: { 200: t.Any() } })

  .post('/:id/reset-password', async ({ params, set }) => {
    const employee = await db.query.identityUsers.findFirst({
      where: eq(identityUsers.id, params.id),
    })
    if (!employee) {
      set.status = 404
      return { message: 'Not found' }
    }
    if (!employee.gipUid) {
      set.status = 400
      return { message: 'Employee has not been provisioned yet' }
    }
    const displayEmail = await getDisplayEmail(params.id)
    if (!displayEmail) {
      set.status = 400
      return { message: 'Employee has no email address' }
    }
    await generatePasswordResetLink(displayEmail)
    return { ok: true, email: displayEmail }
  }, { response: { 200: t.Object({ ok: t.Literal(true), email: t.String() }), 400: t.Object({ message: t.String() }), 404: t.Object({ message: t.String() }) } })

  .post(
    '/:id/upgrade-workspace',
    async ({ params, body, authUser, requestId, actorIp, set }) => {
      const employee = await db.query.identityUsers.findFirst({
        where: eq(identityUsers.id, params.id),
      })

      if (!employee) {
        set.status = 404
        return { message: 'Not found' }
      }

      if (employee.hasGoogleWorkspace) {
        set.status = 400
        return { message: 'Employee already has a Google Workspace account' }
      }

      const newWorkspaceEmailNorm = body.workspaceEmail.toLowerCase().trim()

      // Check workspace email is not already taken in identity_user_emails
      const emailTaken = await db
        .select({ id: identityUserEmails.id })
        .from(identityUserEmails)
        .where(eq(identityUserEmails.emailNormalized, newWorkspaceEmailNorm))
        .limit(1)

      if (emailTaken.length > 0) {
        set.status = 409
        return { message: `Email ${body.workspaceEmail} is already in use by another employee` }
      }

      const now = new Date()
      const changedFields = ['workspaceEmail', 'hasGoogleWorkspace', 'source']

      // Capture the previous display email for the audit log BEFORE any changes
      const previousEmail = await getDisplayEmail(params.id)

      // Update identity_users row (no email columns — just flags and profile fields)
      const identityUpdates: Record<string, unknown> = {
        hasGoogleWorkspace: true,
        source: 'csv_import',
        updatedAt: now,
      }
      if (body.name) { identityUpdates.name = body.name; changedFields.push('name') }
      if (body.department) { identityUpdates.department = body.department; changedFields.push('department') }
      if (body.position) { identityUpdates.position = body.position; changedFields.push('position') }
      if (body.phone) { identityUpdates.phone = body.phone; changedFields.push('phone') }

      // Demote any existing isPrimary=true personal email row BEFORE inserting the
      // workspace row — the unique partial index (identityUserId WHERE isPrimary=true)
      // allows only one primary per user; we must clear the old one first.
      await db
        .update(identityUserEmails)
        .set({ isPrimary: false, updatedAt: now })
        .where(
          and(
            eq(identityUserEmails.identityUserId, params.id),
            eq(identityUserEmails.isPrimary, true),
          ),
        )

      // Insert workspace email row — becomes the new primary per Q8a.
      await db.insert(identityUserEmails).values({
        identityUserId: params.id,
        email: body.workspaceEmail,
        emailNormalized: newWorkspaceEmailNorm,
        kind: 'workspace',
        isPrimary: true,
        verifiedAt: now,
        addedBy: 'admin',
      })

      // Update GIP email if provisioned
      if (employee.gipUid) {
        await updateGipUserEmail(employee.gipUid, newWorkspaceEmailNorm)
      }

      await db.update(identityUsers).set(identityUpdates).where(eq(identityUsers.id, params.id))

      await logAudit({
        actorId: authUser.id,
        action: 'upgrade_workspace',
        targetType: 'user',
        targetId: params.id,
        details: {
          previousEmail,
          workspaceEmail: body.workspaceEmail,
        },
        requestId,
        actorIp,
      })

      emitUserUpdated(params.id, changedFields).catch((err) => {
        logger.error({ err, userId: params.id }, '[provisioning-events] emitUserUpdated failed')
      })

      return { ok: true }
    },
    {
      body: t.Object({
        workspaceEmail: t.String({ format: 'email' }),
        name: t.Optional(t.String()),
        department: t.Optional(t.String()),
        position: t.Optional(t.String()),
        phone: t.Optional(t.String()),
      }),
      response: {
        200: t.Object({ ok: t.Literal(true) }),
        400: t.Object({ message: t.String() }),
        404: t.Object({ message: t.String() }),
        409: t.Object({ message: t.String() }),
      },
    },
  )

  // ---------------------------------------------------------------------------
  // /v1/employees/:id/emails — admin email management (Spec 06 PR D §618-628)
  //
  // Admin posture: trusted-on-entry (verifiedAt=NOW(), addedBy='admin'),
  // collision response REVEALS the colliding identity (admin must resolve),
  // workspace-kind add/edit/remove allowed.
  // ---------------------------------------------------------------------------

  .post(
    '/:id/emails',
    async ({ params, body, authUser, requestId, actorIp, set }) => {
      const result = await adminAddEmailToUser({
        targetIdentityUserId: params.id,
        email: body.email,
        kind: body.kind,
      })
      switch (result.outcome) {
        case 'target_user_not_found':
          set.status = 404
          return { error: 'TARGET_NOT_FOUND' as const, message: 'User not found' }
        case 'email_in_use':
          set.status = 409
          return {
            error: 'EMAIL_IN_USE' as const,
            collisionUserId: result.collisionUserId,
            collisionUserName: result.collisionUserName,
          }
        case 'added':
          await logAudit({
            actorId: authUser.id,
            action: 'admin_add_email',
            targetType: 'user',
            targetId: params.id,
            details: { email: body.email, kind: body.kind, isPrimary: result.isPrimary },
            requestId,
            actorIp,
          })
          emitUserUpdated(params.id, ['emails']).catch((err) => {
            logger.error({ err, userId: params.id }, '[admin-emails] emitUserUpdated failed')
          })
          return { ok: true as const, emailId: result.emailId, isPrimary: result.isPrimary }
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        email: t.String({ format: 'email', maxLength: 255 }),
        kind: t.Union([t.Literal('workspace'), t.Literal('personal')]),
      }),
      response: {
        200: t.Object({
          ok: t.Literal(true),
          emailId: t.String(),
          isPrimary: t.Boolean(),
        }),
        404: t.Object({ error: t.Literal('TARGET_NOT_FOUND'), message: t.String() }),
        409: t.Object({
          error: t.Literal('EMAIL_IN_USE'),
          collisionUserId: t.String(),
          collisionUserName: t.String(),
        }),
      },
    },
  )

  .patch(
    '/:id/emails/:emailId',
    async ({ params, body, authUser, requestId, actorIp, set }) => {
      // Two distinct operations behind one endpoint: edit address, set primary.
      // Mutually exclusive — body carries either { email } or { isPrimary: true }.
      if (body.isPrimary === true) {
        const result = await adminSetEmailPrimary({
          targetIdentityUserId: params.id,
          emailId: params.emailId,
        })
        switch (result.outcome) {
          case 'updated':
            await logAudit({
              actorId: authUser.id,
              action: 'admin_set_email_primary',
              targetType: 'user',
              targetId: params.id,
              details: { emailId: params.emailId },
              requestId,
              actorIp,
            })
            emitUserUpdated(params.id, ['emails']).catch((err) => {
              logger.error({ err, userId: params.id }, '[admin-emails] emitUserUpdated failed')
            })
            return { ok: true as const }
          case 'email_not_found':
          case 'wrong_target_user':
            set.status = 404
            return { error: 'EMAIL_NOT_FOUND' as const, message: 'Email row not found on this user' }
          case 'not_verified':
            set.status = 400
            return {
              error: 'NOT_VERIFIED' as const,
              message: 'Verify this email before setting it as primary.',
            }
          case 'email_in_use':
            // Unreachable — set-primary doesn't change address. Defensive.
            set.status = 409
            return {
              error: 'EMAIL_IN_USE' as const,
              collisionUserId: result.collisionUserId,
              collisionUserName: result.collisionUserName,
            }
        }
      }
      if (body.email) {
        const result = await adminEditEmailAddress({
          targetIdentityUserId: params.id,
          emailId: params.emailId,
          newEmail: body.email,
        })
        switch (result.outcome) {
          case 'updated':
            await logAudit({
              actorId: authUser.id,
              action: 'admin_edit_email',
              targetType: 'user',
              targetId: params.id,
              details: { emailId: params.emailId, newEmail: body.email },
              requestId,
              actorIp,
            })
            emitUserUpdated(params.id, ['emails']).catch((err) => {
              logger.error({ err, userId: params.id }, '[admin-emails] emitUserUpdated failed')
            })
            return { ok: true as const }
          case 'email_not_found':
          case 'wrong_target_user':
            set.status = 404
            return { error: 'EMAIL_NOT_FOUND' as const, message: 'Email row not found on this user' }
          case 'email_in_use':
            set.status = 409
            return {
              error: 'EMAIL_IN_USE' as const,
              collisionUserId: result.collisionUserId,
              collisionUserName: result.collisionUserName,
            }
          case 'not_verified':
            // Unreachable for the address-edit path. Defensive.
            set.status = 400
            return { error: 'NOT_VERIFIED' as const, message: 'Email is not verified' }
        }
      }
      set.status = 400
      return {
        error: 'INVALID_BODY' as const,
        message: 'Provide { email } to change address or { isPrimary: true } to promote.',
      }
    },
    {
      params: t.Object({ id: t.String(), emailId: t.String() }),
      body: t.Object({
        email: t.Optional(t.String({ format: 'email', maxLength: 255 })),
        isPrimary: t.Optional(t.Boolean()),
      }),
      response: {
        200: t.Object({ ok: t.Literal(true) }),
        400: t.Union([
          t.Object({ error: t.Literal('INVALID_BODY'), message: t.String() }),
          t.Object({ error: t.Literal('NOT_VERIFIED'), message: t.String() }),
        ]),
        404: t.Object({ error: t.Literal('EMAIL_NOT_FOUND'), message: t.String() }),
        409: t.Object({
          error: t.Literal('EMAIL_IN_USE'),
          collisionUserId: t.String(),
          collisionUserName: t.String(),
        }),
      },
    },
  )

  .delete(
    '/:id/emails/:emailId',
    async ({ params, authUser, requestId, actorIp, set }) => {
      const result = await adminRemoveEmail({
        targetIdentityUserId: params.id,
        emailId: params.emailId,
      })
      switch (result.outcome) {
        case 'removed':
          await logAudit({
            actorId: authUser.id,
            action: 'admin_remove_email',
            targetType: 'user',
            targetId: params.id,
            details: { emailId: params.emailId },
            requestId,
            actorIp,
          })
          emitUserUpdated(params.id, ['emails']).catch((err) => {
            logger.error({ err, userId: params.id }, '[admin-emails] emitUserUpdated failed')
          })
          return { ok: true as const }
        case 'email_not_found':
        case 'wrong_target_user':
          set.status = 404
          return { error: 'EMAIL_NOT_FOUND' as const, message: 'Email row not found on this user' }
        case 'last_verified_email':
          set.status = 409
          return {
            error: 'LAST_VERIFIED_EMAIL' as const,
            message: 'Cannot remove the user\'s only verified sign-in email.',
          }
      }
    },
    {
      params: t.Object({ id: t.String(), emailId: t.String() }),
      response: {
        200: t.Object({ ok: t.Literal(true) }),
        404: t.Object({ error: t.Literal('EMAIL_NOT_FOUND'), message: t.String() }),
        409: t.Object({ error: t.Literal('LAST_VERIFIED_EMAIL'), message: t.String() }),
      },
    },
  )

  // ---------------------------------------------------------------------------
  // POST /v1/employees/:id/sign-out-all — Spec 06 PR E §9
  //
  // Admin sign-out-everywhere on a target user.  revokeAllSessionsForUser writes both
  // the per-row UPDATE on auth_sessions AND the session_revocations cutoff row when
  // reason='admin_revoke' (see services/sessions.ts), so this handler is a thin wrapper
  // that adds target-user verification, the active-session count for the audit details,
  // and the audit-log entry.
  // ---------------------------------------------------------------------------
  .post(
    '/:id/sign-out-all',
    async ({ params, authUser, requestId, actorIp, set }) => {
      const target = await db
        .select({ id: identityUsers.id })
        .from(identityUsers)
        .where(eq(identityUsers.id, params.id))
        .limit(1)
      if (target.length === 0) {
        set.status = 404
        return { error: 'TARGET_NOT_FOUND' as const, message: 'User not found' }
      }

      const activeBefore = await db
        .select({ id: authSessions.id })
        .from(authSessions)
        .where(and(eq(authSessions.identityUserId, params.id), isNull(authSessions.revokedAt)))

      const revoked = activeBefore.length

      await revokeAllSessionsForUser({ userId: params.id, reason: 'admin_revoke' })

      await logAudit({
        actorId: authUser.id,
        action: 'admin_sign_out_all',
        targetType: 'user',
        targetId: params.id,
        details: { revoked },
        requestId,
        actorIp,
      })

      return { revoked }
    },
    {
      params: t.Object({ id: t.String() }),
      response: {
        200: t.Object({ revoked: t.Number() }),
        404: t.Object({ error: t.Literal('TARGET_NOT_FOUND'), message: t.String() }),
      },
    },
  )

  // ---------------------------------------------------------------------------
  // POST /v1/employees/:id/login-link — Spec 06 PR E §11 (super_admin only)
  //
  // Issue a one-time login link.  The route is mounted under the admin gate
  // (`requireRole('admin')` is the parent .use), so we layer the strict
  // super_admin check inline via `checkSuperAdmin` — the spec-locked design keeps
  // super_admin internal and avoids exporting it via PORTAL_ROLES.
  //
  // Returns the URL once.  The plaintext token never appears in storage; the
  // service hashes SHA-256 before insert.
  // ---------------------------------------------------------------------------
  .post(
    '/:id/login-link',
    async ({ params, body, authUser, requestId, actorIp, set }) => {
      const decision = checkSuperAdmin(authUser)
      if (!decision.ok) {
        set.status = decision.status
        return { error: 'INSUFFICIENT_ROLE' as const, message: decision.message }
      }

      const target = await db
        .select({ id: identityUsers.id })
        .from(identityUsers)
        .where(eq(identityUsers.id, params.id))
        .limit(1)
      if (target.length === 0) {
        set.status = 404
        return { error: 'TARGET_NOT_FOUND' as const, message: 'User not found' }
      }

      const issued = await issueOneTimeLoginLink({
        targetIdentityUserId: params.id,
        issuedBy: authUser.id,
        reason: body.reason,
        reasonText: body.reasonText ?? null,
        requestIp: actorIp ?? null,
      })

      await logAudit({
        actorId: authUser.id,
        action: 'one_time_link_issued',
        targetType: 'user',
        targetId: params.id,
        details: { linkId: issued.id, reason: body.reason, reasonText: body.reasonText ?? null },
        requestId,
        actorIp,
      })

      return {
        id: issued.id,
        url: issued.url,
        expiresAt: issued.expiresAt.toISOString(),
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        reason: t.Union(ONE_TIME_LOGIN_LINK_REASONS.map((r) => t.Literal(r))),
        reasonText: t.Optional(t.String({ maxLength: 1000 })),
      }),
      response: {
        200: t.Object({ id: t.String(), url: t.String(), expiresAt: t.String() }),
        403: t.Object({ error: t.Literal('INSUFFICIENT_ROLE'), message: t.String() }),
        404: t.Object({ error: t.Literal('TARGET_NOT_FOUND'), message: t.String() }),
      },
    },
  )

  // ---------------------------------------------------------------------------
  // GET /v1/employees/:id/login-links — read-only history of one-time link issuances
  // for the user-detail audit table (admin-readable; non-secret metadata only).
  // ---------------------------------------------------------------------------
  .get(
    '/:id/login-links',
    async ({ params }) => {
      const rows = await listOneTimeLoginLinksForUser(params.id)
      return {
        links: rows.map((r) => ({
          id: r.id,
          issuedBy: r.issuedBy,
          reason: r.reason,
          reasonText: r.reasonText,
          expiresAt: r.expiresAt.toISOString(),
          consumedAt: r.consumedAt?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
        })),
      }
    },
    {
      params: t.Object({ id: t.String() }),
      response: {
        200: t.Object({
          links: t.Array(
            t.Object({
              id: t.String(),
              issuedBy: t.Object({ id: t.String(), name: t.String() }),
              reason: t.String(),
              reasonText: t.Union([t.String(), t.Null()]),
              expiresAt: t.String(),
              consumedAt: t.Union([t.String(), t.Null()]),
              createdAt: t.String(),
            }),
          ),
        }),
      },
    },
  )
