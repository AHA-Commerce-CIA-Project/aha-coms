import { Elysia, t } from 'elysia'
import { db } from '~/db'
import { identityUsers } from '~/db/schema'
import { eq, ilike, or, and, sql } from 'drizzle-orm'
import { requireRole } from '../middleware/rbac'
import { generatePasswordResetLink, updateGipUserEmail } from '../gip-admin'
import { createEmployee, deactivateEmployee, batchUpdateEmployees } from '../services/employees'
import { importEmployeesFromGoogleAdminCsv } from '../services/employee-import'
import { processEmployeeProvisioning } from '../services/employee-provisioning'
import { resolveAndSyncClaims } from '../services/claims'
import { logAudit } from '../services/audit'
import { emitUserUpdated } from '../services/provisioning-events'
import { logger } from '~/logger'

const employeeBody = t.Object({
  email: t.String({ format: 'email' }),
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
      const where = query.search ? ilike(identityUsers.email, `%${query.search}%`) : undefined

      const [rows, [{ count }]] = await Promise.all([
        db
          .select({
            id: identityUsers.id,
            email: identityUsers.email,
            personalEmail: identityUsers.personalEmail,
            name: identityUsers.name,
            phone: identityUsers.phone,
            department: identityUsers.department,
            position: identityUsers.position,
            branch: identityUsers.branch,

            birthDate: identityUsers.birthDate,
            leaderName: identityUsers.leaderName,
            portalRole: identityUsers.portalRole,
            status: identityUsers.status,
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
      return db
        .select({
          id: identityUsers.id,
          name: identityUsers.name,
          email: identityUsers.email,
        })
        .from(identityUsers)
        .where(
          and(
            eq(identityUsers.status, 'active'),
            or(
              ilike(identityUsers.name, pattern),
              ilike(identityUsers.email, pattern),
              ilike(identityUsers.personalEmail, pattern),
            ),
          ),
        )
        .limit(10)
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
    async ({ body, authUser, requestId, actorIp }) => {
      const result = await createEmployee(body)
      await logAudit({
        actorId: authUser.id,
        action: 'create_employee',
        targetType: 'user',
        targetId: result.id,
        details: {
          email: body.email,
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
        email: identityUsers.email,
        personalEmail: identityUsers.personalEmail,
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
    return user
  }, { response: { 200: t.Any(), 404: t.Object({ message: t.String() }) } })

  .patch(
    '/:id',
    async ({ params, body, authUser, requestId, actorIp }) => {
      const needsExistingUser = body.email !== undefined || body.portalRole !== undefined
      const existingUser = needsExistingUser
        ? await db.query.identityUsers.findFirst({ where: eq(identityUsers.id, params.id) })
        : undefined

      if (body.email !== undefined && existingUser?.gipUid && existingUser.email !== body.email) {
        await updateGipUserEmail(existingUser.gipUid, body.email)
      }

      await db
        .update(identityUsers)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(identityUsers.id, params.id))

      if (body.portalRole && existingUser?.gipUid) {
        await resolveAndSyncClaims(existingUser.gipUid, params.id)
      }

      await logAudit({
        actorId: authUser.id,
        action: 'update_employee',
        targetType: 'user',
        targetId: params.id,
        details: body.portalRole ? { portalRole: body.portalRole } : undefined,
        requestId,
        actorIp,
      })

      // Compute changedFields from request body keys (only fields present in body)
      const changedFields = Object.keys(body).filter(
        (k) => body[k as keyof typeof body] !== undefined,
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
    await generatePasswordResetLink(employee.email)
    return { ok: true, email: employee.email }
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

      // Check workspace email is not already taken
      const emailTaken = await db
        .select({ id: identityUsers.id })
        .from(identityUsers)
        .where(eq(identityUsers.email, body.workspaceEmail.toLowerCase()))
        .limit(1)

      if (emailTaken.length > 0) {
        set.status = 409
        return { message: `Email ${body.workspaceEmail} is already in use by another employee` }
      }

      // Preserve current email as personalEmail if not already set
      const personalEmail = employee.personalEmail ?? employee.email

      // Build update fields
      const updates: Record<string, unknown> = {
        email: body.workspaceEmail.toLowerCase(),
        personalEmail,
        hasGoogleWorkspace: true,
        source: 'csv_import',
        updatedAt: new Date(),
      }

      const changedFields = ['email', 'personalEmail', 'hasGoogleWorkspace', 'source']

      if (body.name) { updates.name = body.name; changedFields.push('name') }
      if (body.department) { updates.department = body.department; changedFields.push('department') }
      if (body.position) { updates.position = body.position; changedFields.push('position') }
      if (body.phone) { updates.phone = body.phone; changedFields.push('phone') }

      // Update GIP email if provisioned
      if (employee.gipUid) {
        await updateGipUserEmail(employee.gipUid, body.workspaceEmail.toLowerCase())
      }

      await db
        .update(identityUsers)
        .set(updates)
        .where(eq(identityUsers.id, params.id))

      await logAudit({
        actorId: authUser.id,
        action: 'upgrade_workspace',
        targetType: 'user',
        targetId: params.id,
        details: {
          previousEmail: employee.email,
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
