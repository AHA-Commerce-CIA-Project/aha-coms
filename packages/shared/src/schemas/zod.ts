import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { identityUsers } from '@coms-portal/api/src/db/schema/identity-users'
import { teams } from '@coms-portal/api/src/db/schema/teams'
import { appRegistry } from '@coms-portal/api/src/db/schema/apps'

// Zod schemas for SvelteKit form validation (complex forms only)
export const insertIdentityUserZod = createInsertSchema(identityUsers)
export const insertTeamZod = createInsertSchema(teams)
export const insertAppRegistryZod = createInsertSchema(appRegistry)

// Select schemas for response typing
export const selectIdentityUserZod = createSelectSchema(identityUsers)
