// packages/shared/src/schemas/index.ts
// !! AUTO-GENERATED — do not edit by hand !!
// Run `bun run generate:schemas` in packages/shared to regenerate.

// --- Hand-written domain schemas (ported from src/shared/schemas) ---
export { uuidSchema, paginationSchema, type PaginationInput } from './common'
export {
  createUserSchema,
  updateUserSchema,
  listUsersSchema,
  type CreateUserInput,
  type UpdateUserInput,
  type ListUsersInput,
} from './users'
export {
  createTeamSchema,
  updateTeamSchema,
  listTeamsSchema,
  type CreateTeamInput,
  type UpdateTeamInput,
  type ListTeamsInput,
} from './teams'
export {
  submitPointSchema,
  listPointsSchema,
  approveRejectSchema,
  type SubmitPointInput,
  type ListPointsInput,
  type ApproveRejectInput,
} from './points'
export {
  fileChallengeSchema,
  resolveChallengeSchema,
  listChallengesSchema,
  type FileChallengeInput,
  type ResolveChallengeInput,
  type ListChallengesInput,
} from './challenges'
export {
  fileAppealSchema,
  resolveAppealSchema,
  listAppealsSchema,
  type FileAppealInput,
  type ResolveAppealInput,
  type ListAppealsInput,
} from './appeals'
export {
  createCommentSchema,
  updateCommentSchema,
  listCommentsSchema,
  type CreateCommentInput,
  type UpdateCommentInput,
  type ListCommentsInput,
} from './comments'
export {
  bulkUserActionSchema,
  bulkPointActionSchema,
  bulkRedemptionActionSchema,
  type BulkUserActionInput,
  type BulkPointActionInput,
  type BulkRedemptionActionInput,
  type BulkResult,
  type BulkResultItem,
} from './bulk'
export {
  listAuditLogsSchema,
  type ListAuditLogsInput,
} from './audit'
export {
  requestRedemptionSchema,
  listRedemptionsSchema,
  resolveRedemptionSchema,
  type RequestRedemptionInput,
  type ListRedemptionsInput,
  type ResolveRedemptionInput,
} from './redemptions'
export {
  reportsQuerySchema,
  type ReportsQueryInput,
} from './reports'
export {
  listRewardsSchema,
  createRewardSchema,
  updateRewardSchema,
  type ListRewardsInput,
  type CreateRewardInput,
  type UpdateRewardInput,
} from './rewards'
export {
  listSettingsSchema,
  updateSettingSchema,
  type ListSettingsInput,
  type UpdateSettingInput,
} from './settings'
export {
  syncJobSchema,
  syncStatusSchema,
  type SyncJob,
  type SyncStatus,
} from './sheet-sync'
// --- End hand-written schemas ---

import { createInsertSchema, createSelectSchema } from 'drizzle-typebox'
import type { Static } from '@sinclair/typebox'
import { Type, type TObject } from '@sinclair/typebox'
import {
  session,
  account,
  verification,
} from '../db/schema'
import {
  heroesProfiles,
  systemSettings,
  pointCategories,
  pointCategoryTranslations,
  achievementPoints,
  challenges,
  appeals,
  comments,
  rewards,
  redemptions,
  notifications,
  pointSummaries,
  auditLogs,
  sheetSyncJobs,
  pendingAliasResolution,
  aliasCache,
  taxonomyCache,
  userConfigCache,
  emailCache,
  deactivatedUserIngestAudit,
} from '../db/schema'

// --- session ---
export const sessionSelectSchema: TObject = createSelectSchema(session) as TObject
export type SessionSelect = Static<typeof sessionSelectSchema>
export const sessionInsertSchema: TObject = createInsertSchema(session) as TObject
export type SessionInsert = Static<typeof sessionInsertSchema>

// --- account ---
export const accountSelectSchema: TObject = createSelectSchema(account) as TObject
export type AccountSelect = Static<typeof accountSelectSchema>
export const accountInsertSchema: TObject = createInsertSchema(account) as TObject
export type AccountInsert = Static<typeof accountInsertSchema>

// --- verification ---
export const verificationSelectSchema: TObject = createSelectSchema(verification) as TObject
export type VerificationSelect = Static<typeof verificationSelectSchema>
export const verificationInsertSchema: TObject = createInsertSchema(verification) as TObject
export type VerificationInsert = Static<typeof verificationInsertSchema>

// --- heroesProfiles ---
export const heroesProfilesSelectSchema: TObject = createSelectSchema(heroesProfiles) as TObject
export type HeroesProfilesSelect = Static<typeof heroesProfilesSelectSchema>
export const heroesProfilesInsertSchema: TObject = createInsertSchema(heroesProfiles) as TObject
export type HeroesProfilesInsert = Static<typeof heroesProfilesInsertSchema>

// --- systemSettings ---
export const systemSettingsSelectSchema: TObject = createSelectSchema(systemSettings) as TObject
export type SystemSettingsSelect = Static<typeof systemSettingsSelectSchema>
export const systemSettingsInsertSchema: TObject = createInsertSchema(systemSettings) as TObject
export type SystemSettingsInsert = Static<typeof systemSettingsInsertSchema>

// --- pointCategories ---
export const pointCategoriesSelectSchema: TObject = createSelectSchema(pointCategories) as TObject
export type PointCategoriesSelect = Static<typeof pointCategoriesSelectSchema>
export const pointCategoriesInsertSchema: TObject = createInsertSchema(pointCategories) as TObject
export type PointCategoriesInsert = Static<typeof pointCategoriesInsertSchema>

// --- pointCategoryTranslations ---
export const pointCategoryTranslationsSelectSchema: TObject = createSelectSchema(pointCategoryTranslations) as TObject
export type PointCategoryTranslationsSelect = Static<typeof pointCategoryTranslationsSelectSchema>
export const pointCategoryTranslationsInsertSchema: TObject = createInsertSchema(pointCategoryTranslations) as TObject
export type PointCategoryTranslationsInsert = Static<typeof pointCategoryTranslationsInsertSchema>

// --- achievementPoints ---
export const achievementPointsSelectSchema: TObject = createSelectSchema(achievementPoints) as TObject
export type AchievementPointsSelect = Static<typeof achievementPointsSelectSchema>
export const achievementPointsInsertSchema: TObject = createInsertSchema(achievementPoints) as TObject
export type AchievementPointsInsert = Static<typeof achievementPointsInsertSchema>

// --- challenges ---
export const challengesSelectSchema: TObject = createSelectSchema(challenges) as TObject
export type ChallengesSelect = Static<typeof challengesSelectSchema>
export const challengesInsertSchema: TObject = createInsertSchema(challenges) as TObject
export type ChallengesInsert = Static<typeof challengesInsertSchema>

// --- appeals ---
export const appealsSelectSchema: TObject = createSelectSchema(appeals) as TObject
export type AppealsSelect = Static<typeof appealsSelectSchema>
export const appealsInsertSchema: TObject = createInsertSchema(appeals) as TObject
export type AppealsInsert = Static<typeof appealsInsertSchema>

// --- comments ---
export const commentsSelectSchema: TObject = createSelectSchema(comments) as TObject
export type CommentsSelect = Static<typeof commentsSelectSchema>
export const commentsInsertSchema: TObject = createInsertSchema(comments) as TObject
export type CommentsInsert = Static<typeof commentsInsertSchema>

// --- rewards ---
export const rewardsSelectSchema: TObject = createSelectSchema(rewards) as TObject
export type RewardsSelect = Static<typeof rewardsSelectSchema>
export const rewardsInsertSchema: TObject = createInsertSchema(rewards) as TObject
export type RewardsInsert = Static<typeof rewardsInsertSchema>

// --- redemptions ---
export const redemptionsSelectSchema: TObject = createSelectSchema(redemptions) as TObject
export type RedemptionsSelect = Static<typeof redemptionsSelectSchema>
export const redemptionsInsertSchema: TObject = createInsertSchema(redemptions) as TObject
export type RedemptionsInsert = Static<typeof redemptionsInsertSchema>

// --- notifications ---
export const notificationsSelectSchema: TObject = createSelectSchema(notifications) as TObject
export type NotificationsSelect = Static<typeof notificationsSelectSchema>
export const notificationsInsertSchema: TObject = createInsertSchema(notifications) as TObject
export type NotificationsInsert = Static<typeof notificationsInsertSchema>

// --- pointSummaries ---
export const pointSummariesSelectSchema: TObject = createSelectSchema(pointSummaries) as TObject
export type PointSummariesSelect = Static<typeof pointSummariesSelectSchema>
export const pointSummariesInsertSchema: TObject = createInsertSchema(pointSummaries) as TObject
export type PointSummariesInsert = Static<typeof pointSummariesInsertSchema>

// --- auditLogs ---
export const auditLogsSelectSchema: TObject = createSelectSchema(auditLogs) as TObject
export type AuditLogsSelect = Static<typeof auditLogsSelectSchema>
export const auditLogsInsertSchema: TObject = createInsertSchema(auditLogs) as TObject
export type AuditLogsInsert = Static<typeof auditLogsInsertSchema>

// --- sheetSyncJobs ---
export const sheetSyncJobsSelectSchema: TObject = createSelectSchema(sheetSyncJobs) as TObject
export type SheetSyncJobsSelect = Static<typeof sheetSyncJobsSelectSchema>
export const sheetSyncJobsInsertSchema: TObject = createInsertSchema(sheetSyncJobs) as TObject
export type SheetSyncJobsInsert = Static<typeof sheetSyncJobsInsertSchema>

// --- pendingAliasResolution ---
export const pendingAliasResolutionSelectSchema: TObject = createSelectSchema(pendingAliasResolution) as TObject
export type PendingAliasResolutionSelect = Static<typeof pendingAliasResolutionSelectSchema>
export const pendingAliasResolutionInsertSchema: TObject = createInsertSchema(pendingAliasResolution) as TObject
export type PendingAliasResolutionInsert = Static<typeof pendingAliasResolutionInsertSchema>

// --- aliasCache ---
export const aliasCacheSelectSchema: TObject = createSelectSchema(aliasCache) as TObject
export type AliasCacheSelect = Static<typeof aliasCacheSelectSchema>
export const aliasCacheInsertSchema: TObject = createInsertSchema(aliasCache) as TObject
export type AliasCacheInsert = Static<typeof aliasCacheInsertSchema>

// --- taxonomyCache ---
export const taxonomyCacheSelectSchema: TObject = createSelectSchema(taxonomyCache) as TObject
export type TaxonomyCacheSelect = Static<typeof taxonomyCacheSelectSchema>
export const taxonomyCacheInsertSchema: TObject = createInsertSchema(taxonomyCache) as TObject
export type TaxonomyCacheInsert = Static<typeof taxonomyCacheInsertSchema>

// --- userConfigCache ---
export const userConfigCacheSelectSchema: TObject = createSelectSchema(userConfigCache) as TObject
export type UserConfigCacheSelect = Static<typeof userConfigCacheSelectSchema>
export const userConfigCacheInsertSchema: TObject = createInsertSchema(userConfigCache) as TObject
export type UserConfigCacheInsert = Static<typeof userConfigCacheInsertSchema>

// --- emailCache ---
export const emailCacheSelectSchema: TObject = createSelectSchema(emailCache) as TObject
export type EmailCacheSelect = Static<typeof emailCacheSelectSchema>
export const emailCacheInsertSchema: TObject = createInsertSchema(emailCache) as TObject
export type EmailCacheInsert = Static<typeof emailCacheInsertSchema>

// --- deactivatedUserIngestAudit ---
export const deactivatedUserIngestAuditSelectSchema: TObject = createSelectSchema(deactivatedUserIngestAudit) as TObject
export type DeactivatedUserIngestAuditSelect = Static<typeof deactivatedUserIngestAuditSelectSchema>
export const deactivatedUserIngestAuditInsertSchema: TObject = createInsertSchema(deactivatedUserIngestAudit) as TObject
export type DeactivatedUserIngestAuditInsert = Static<typeof deactivatedUserIngestAuditInsertSchema>

// --- safeHeroesProfile (heroes_profiles select schema without password-management fields) ---
export const safeHeroesProfileSchema: TObject = Type.Omit(heroesProfilesSelectSchema, ['mustChangePassword']) as unknown as TObject
export type SafeHeroesProfile = Static<typeof safeHeroesProfileSchema>

export { Type }
