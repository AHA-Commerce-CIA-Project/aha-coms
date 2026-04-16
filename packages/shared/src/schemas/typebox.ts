import type { TSchema } from '@sinclair/typebox'
import { createInsertSchema, createSelectSchema } from 'drizzle-typebox'
import { identityUsers } from '@coms-portal/api/src/db/schema/identity-users'
import { teams, teamMembers } from '@coms-portal/api/src/db/schema/teams'
import { appRegistry, teamAppAccess } from '@coms-portal/api/src/db/schema/apps'

const createPortableSelectSchema = createSelectSchema as (table: unknown) => TSchema
const createPortableInsertSchema = createInsertSchema as (table: unknown) => TSchema

// Select schemas (for API response typing)
export const selectIdentityUserSchema = createPortableSelectSchema(identityUsers)
export const selectTeamSchema = createPortableSelectSchema(teams)
export const selectTeamMemberSchema = createPortableSelectSchema(teamMembers)
export const selectAppRegistrySchema = createPortableSelectSchema(appRegistry)
export const selectTeamAppAccessSchema = createPortableSelectSchema(teamAppAccess)

// Insert schemas (for API request body validation)
export const insertIdentityUserSchema = createPortableInsertSchema(identityUsers)
export const insertTeamSchema = createPortableInsertSchema(teams)
export const insertTeamMemberSchema = createPortableInsertSchema(teamMembers)
export const insertAppRegistrySchema = createPortableInsertSchema(appRegistry)
export const insertTeamAppAccessSchema = createPortableInsertSchema(teamAppAccess)
