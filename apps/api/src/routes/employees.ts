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
import { emitUserUpdated } from '../services/provisioning-events'
import { getDisplayEmail } from '../services/email-resolution'
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

      return { data: rows, total: Number(count), page, limit }
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

      // Attach display email per Q8a for each result
      const results = await Promise.all(
        users.map(async (u) => ({
          id: u.id,
          name: u.name,
          email: (await getDisplayEmail(u.id)) ?? '',
        })),
      )
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

      // Compute changedFields from non-email body keys
      const changedFields = Object.keys(identityFieldsOnly).filter(
        (k) => identityFieldsOnly[k as keyof typeof identityFieldsOnly] !== undefined,
      )
      if (changedFields.length > 0) {
        emitUserUpdated(params.id, changedFields).catch((err) => {
          logger.error({ err, userId: params.id }, '[provisioning-events] emitUserUpdated failed')
        })
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
