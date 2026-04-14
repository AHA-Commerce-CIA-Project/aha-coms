import { z } from 'zod'

export const createEmployeeSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(255),
  phone: z.string().max(20).optional(),
  department: z.string().max(100).optional(),
  position: z.string().max(100).optional(),
  portalRole: z.enum(['employee', 'admin', 'super_admin']).default('employee'),
  hasGoogleWorkspace: z.boolean().default(false),
})

export const updateEmployeeSchema = createEmployeeSchema
  .omit({ email: true })
  .partial()
  .extend({
    status: z.enum(['active', 'inactive']).optional(),
  })

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>
