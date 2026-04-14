import { z } from 'zod'

export const createTeamSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
})

export const updateTeamSchema = createTeamSchema.partial()

export const addTeamMemberSchema = z.object({
  userId: z.string().uuid(),
})

export type CreateTeamInput = z.infer<typeof createTeamSchema>
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>
export type AddTeamMemberInput = z.infer<typeof addTeamMemberSchema>
