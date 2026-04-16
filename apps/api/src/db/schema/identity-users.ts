import { pgTable, uuid, varchar, boolean, text, timestamp } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const EMPLOYEE_PROVISIONING_STATUSES = ['ready', 'pending', 'processing', 'failed'] as const
export type EmployeeProvisioningStatus = (typeof EMPLOYEE_PROVISIONING_STATUSES)[number]

export const identityUsers = pgTable('identity_users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  gipUid: text('gip_uid').unique(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 20 }),
  department: varchar('department', { length: 100 }),
  position: varchar('position', { length: 100 }),
  branch: varchar('branch', { length: 50 }),
  portalRole: varchar('portal_role', { length: 20 }).notNull().default('employee'),
  personalEmail: varchar('personal_email', { length: 255 }),
  hasGoogleWorkspace: boolean('has_google_workspace').notNull().default(false),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  provisioningStatus: varchar('provisioning_status', { length: 20 }).notNull().default('ready'),
  provisioningError: text('provisioning_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type IdentityUser = typeof identityUsers.$inferSelect
export type NewIdentityUser = typeof identityUsers.$inferInsert
