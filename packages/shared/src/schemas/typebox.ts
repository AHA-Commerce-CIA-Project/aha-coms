import { createInsertSchema, createSelectSchema } from 'drizzle-typebox'
import { identityUsers } from '@coms-portal/api/src/db/schema/identity-users'
import { teams, teamMembers } from '@coms-portal/api/src/db/schema/teams'
import { appRegistry, teamAppAccess } from '@coms-portal/api/src/db/schema/apps'

// Select schemas (for API response typing)
export const selectIdentityUserSchema = createSelectSchema(identityUsers)
export const selectTeamSchema = createSelectSchema(teams)
export const selectTeamMemberSchema = createSelectSchema(teamMembers)
export const selectAppRegistrySchema = createSelectSchema(appRegistry)
export const selectTeamAppAccessSchema = createSelectSchema(teamAppAccess)

// Insert schemas (for API request body validation)
export const insertIdentityUserSchema = createInsertSchema(identityUsers)
export const insertTeamSchema = createInsertSchema(teams)
export const insertTeamMemberSchema = createInsertSchema(teamMembers)
export const insertAppRegistrySchema = createInsertSchema(appRegistry)
export const insertTeamAppAccessSchema = createInsertSchema(teamAppAccess)
