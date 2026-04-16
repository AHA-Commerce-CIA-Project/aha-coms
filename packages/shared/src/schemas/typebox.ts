import type { TSchema } from '@sinclair/typebox'
import { createInsertSchema, createSelectSchema } from 'drizzle-typebox'
import { identityUsers } from '@coms-portal/api/src/db/schema/identity-users'
import type { IdentityUser, NewIdentityUser } from '@coms-portal/api/src/db/schema/identity-users'
import { teams, teamMembers } from '@coms-portal/api/src/db/schema/teams'
import type { Team, NewTeam, TeamMember, NewTeamMember } from '@coms-portal/api/src/db/schema/teams'
import { appRegistry, teamAppAccess } from '@coms-portal/api/src/db/schema/apps'
import type { AppRegistry, NewAppRegistry, TeamAppAccess, NewTeamAppAccess } from '@coms-portal/api/src/db/schema/apps'

type PortableSchema<T> = TSchema & { static: T }
const createPortableSelectSchema = createSelectSchema as (table: unknown) => TSchema
const createPortableInsertSchema = createInsertSchema as (table: unknown) => TSchema

// Select schemas (for API response typing)
export const selectIdentityUserSchema = createPortableSelectSchema(identityUsers) as PortableSchema<IdentityUser>
export const selectTeamSchema = createPortableSelectSchema(teams) as PortableSchema<Team>
export const selectTeamMemberSchema = createPortableSelectSchema(teamMembers) as PortableSchema<TeamMember>
export const selectAppRegistrySchema = createPortableSelectSchema(appRegistry) as PortableSchema<AppRegistry>
export const selectTeamAppAccessSchema = createPortableSelectSchema(teamAppAccess) as PortableSchema<TeamAppAccess>

// Insert schemas (for API request body validation)
export const insertIdentityUserSchema = createPortableInsertSchema(identityUsers) as PortableSchema<NewIdentityUser>
export const insertTeamSchema = createPortableInsertSchema(teams) as PortableSchema<NewTeam>
export const insertTeamMemberSchema = createPortableInsertSchema(teamMembers) as PortableSchema<NewTeamMember>
export const insertAppRegistrySchema = createPortableInsertSchema(appRegistry) as PortableSchema<NewAppRegistry>
export const insertTeamAppAccessSchema = createPortableInsertSchema(teamAppAccess) as PortableSchema<NewTeamAppAccess>
