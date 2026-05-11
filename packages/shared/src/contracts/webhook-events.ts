import type { PortalRole } from './auth'

export const PORTAL_WEBHOOK_CONTRACT_VERSION = 1 as const

// ---------------------------------------------------------------------------
// Email entry types (spec-06 dual-email auth)
// ---------------------------------------------------------------------------

export const USER_EMAIL_KINDS = ['workspace', 'personal'] as const
export type UserEmailKind = (typeof USER_EMAIL_KINDS)[number]

export const USER_EMAIL_ADDED_BY = [
  'admin',
  'self',
  'csv_import',
  'sheet_sync',
  'backfill',
  'bootstrap',
] as const
export type UserEmailAddedBy = (typeof USER_EMAIL_ADDED_BY)[number]

/** A single email address entry on a user, as surfaced in webhook payloads. */
export interface UserEmailEntry {
  address: string
  kind: UserEmailKind
  isPrimary: boolean
  verified: boolean
  addedBy: UserEmailAddedBy
}

export const PORTAL_WEBHOOK_EVENTS = [
  'alias.deleted',
  'alias.resolved',
  'alias.updated',
  // Rev 4 Spec 06 — synthetic onboarding probe. The portal dispatches this
  // event synchronously (not via the standard subscribe-and-fan-out flow) to
  // every active webhook endpoint when `coms-portal-cli smoketest <slug>`
  // runs. Receivers should recognise the name and ack 2xx without
  // business-side processing.
  'app.smoketest',
  'app_config.updated',
  'employment.updated',
  'session.revoked',
  'taxonomy.deleted',
  'taxonomy.upserted',
  'user.provisioned',
  'user.updated',
  'user.offboarded',
] as const

export type PortalWebhookEvent = (typeof PORTAL_WEBHOOK_EVENTS)[number]

export interface PortalWebhookEnvelope<TPayload = unknown> {
  contractVersion: typeof PORTAL_WEBHOOK_CONTRACT_VERSION
  event: PortalWebhookEvent
  /** uuid — apps use this for idempotency */
  eventId: string
  /** ISO timestamp */
  occurredAt: string
  /** The recipient app's slug (handy for multi-tenant receivers) */
  appSlug: string
  payload: TPayload
}

// Payload shapes — tight, no internal fields leaked

export interface SessionRevokedPayload {
  userId: string
  gipUid: string
  email: string
  reason: 'logout' | 'status_change' | 'offboarded' | 'admin'
  /** ISO — sessions issued at or before this instant are revoked */
  notBefore: string
}

export interface UserProvisionedPayload {
  userId: string
  gipUid: string | null
  email: string
  name: string
  portalRole: PortalRole
  teamIds: string[]
  apps: string[]
  /** The resolved app-local role for the recipient app. NULL if the app has no declared roles. */
  appRole: string | null
  /** The employee's office/country branch label (e.g. "Indonesia", "Thailand"). NULL if not set. */
  branch?: string | null
  /** Per-recipient app-config slice. Each recipient receives only its own slice. */
  appConfig?: { config: Record<string, unknown>; schemaVersion: number } | null
  /**
   * All email addresses associated with this user (spec-06 dual-email auth).
   * Additive — existing consumers that do not read this field are unaffected.
   * The scalar `email` field above is preserved and equals the primary address
   * per Q8a precedence (workspace if present, else personal).
   */
  emails?: UserEmailEntry[]
}

export interface UserUpdatedPayload {
  userId: string
  gipUid: string | null
  email: string
  name: string
  portalRole: PortalRole
  teamIds: string[]
  apps: string[]
  /** e.g. ['email', 'portalRole'] */
  changedFields: string[]
  /** The current resolved app-local role for the recipient app. NULL if unchanged or no declared roles. */
  appRole: string | null
  /** The employee's office/country branch label (e.g. "Indonesia", "Thailand"). NULL if not set. */
  branch?: string | null
  /**
   * All email addresses associated with this user (spec-06 dual-email auth).
   * Additive — existing consumers that do not read this field are unaffected.
   * The scalar `email` field above is preserved and equals the primary address
   * per Q8a precedence (workspace if present, else personal).
   */
  emails?: UserEmailEntry[]
}

export interface UserOffboardedPayload {
  userId: string
  gipUid: string | null
  email: string
  /** ISO */
  offboardedAt: string
}

export interface AliasResolvedPayload {
  aliasId: string
  aliasNormalized: string
  portalSub: string
  isPrimary: boolean
}

export interface AliasUpdatedPayload {
  aliasId: string
  aliasNormalized: string
  portalSub: string
  isPrimary: boolean
  previousIsPrimary?: boolean
  previousIdentityUserId?: string
}

export interface AliasDeletedPayload {
  aliasId: string
  aliasNormalized: string
  portalSub: string
}

export interface AppConfigUpdatedPayload {
  portalSub: string
  config: Record<string, unknown>
  previousConfig: Record<string, unknown>
  schemaVersion: number
  batchId: string | null
}

/**
 * Spec 07 finalised name for the per-recipient app-config webhook payload.
 * Identical structure to {@link AppConfigUpdatedPayload}; kept as an alias so
 * Heroes-side handlers can spell the type by its spec-mandated name.
 */
export type AppConfigEvent = AppConfigUpdatedPayload

// ---------------------------------------------------------------------------
// Spec 07 — org taxonomies + employment block (v1.6.0)
// ---------------------------------------------------------------------------

/**
 * A reference to a single entry inside an org taxonomy. `value` is a
 * denormalised display snapshot — consumers store it for display without
 * re-querying. Source-of-truth lives in portal `org_taxonomies`.
 */
export interface TaxonomyRef {
  taxonomyId: string
  key: string
  value: string
}

/**
 * The HR-shaped block carried alongside `user` and `appConfig` on
 * `user.provisioned` / `employment.updated`. `branch`, `team`, `department`
 * are taxonomy refs; the remaining fields are free-form scalars. Every field
 * is nullable — a freshly provisioned user with no HR data fills the block
 * with nulls rather than omitting fields.
 */
export interface EmploymentBlock {
  branch: TaxonomyRef | null
  team: TaxonomyRef | null
  department: TaxonomyRef | null
  position: string | null
  phone: string | null
  employmentStatus: string | null
  talentaId: string | null
  attendanceName: string | null
  leaderName: string | null
  birthDate: string | null
}

/**
 * Payload for `taxonomy.upserted`. Carries the full set of changed entries
 * for one taxonomyId per Spec 07 §Race window — never one event per entry.
 */
export interface TaxonomyUpsertedPayload {
  taxonomyId: string
  entries: Array<{
    key: string
    value: string
    metadata: Record<string, unknown> | null
  }>
}

/** Payload for `taxonomy.deleted`. Carries the keys removed under taxonomyId. */
export interface TaxonomyDeletedPayload {
  taxonomyId: string
  keys: string[]
}

/**
 * Discriminated union over the two taxonomy event variants. Use when a
 * handler dispatches on `kind`; otherwise prefer the variant-specific
 * payload types directly.
 */
export type TaxonomyEvent =
  | ({ kind: 'upserted' } & TaxonomyUpsertedPayload)
  | ({ kind: 'deleted' } & TaxonomyDeletedPayload)

/**
 * Payload for `employment.updated`. Fired on real HR-field deltas only — the
 * portal suppresses the event when the diff is empty. `employment` carries
 * the full post-update block, `previousEmployment` the matching pre-update
 * block (handlers that only need the delta can compare them, but the spec
 * keeps the full blocks so handlers can re-materialise without a re-fetch).
 */
export interface EmploymentUpdatedPayload {
  user: { portalSub: string }
  employment: Partial<EmploymentBlock> | EmploymentBlock
  previousEmployment: Partial<EmploymentBlock> | EmploymentBlock
}

/**
 * The address an H-app should use to contact this user. Resolved per Spec 06
 * §Q8a precedence: workspace email if present, else personal-primary, else
 * the first personal entry. H-apps that need email-by-kind should pull from
 * `GET /api/users/:portalSub/emails`.
 */
export type ContactEmail = string

/**
 * The Spec 07 envelope shape carried by `user.provisioned`. Heroes Deploy A
 * reads from this shape; portal dual-emits legacy top-level fields
 * (`email`, `appRole`, `branch`) alongside this envelope until PR 07-5.
 */
export interface WebhookUserEnvelope {
  user: {
    portalSub: string
    name: string
    /** uuid of the alias resolved as primary, or null when not yet resolved */
    primaryAliasId: string | null
  }
  contactEmail: ContactEmail
  employment: EmploymentBlock | null
  appConfig: { config: Record<string, unknown>; schemaVersion: number } | null
}

export const PORTAL_WEBHOOK_SIGNATURE_HEADER = 'X-Portal-Signature'
export const PORTAL_WEBHOOK_EVENT_HEADER = 'X-Portal-Event'
export const PORTAL_WEBHOOK_EVENT_ID_HEADER = 'X-Portal-Event-Id'
export const PORTAL_WEBHOOK_TIMESTAMP_HEADER = 'X-Portal-Timestamp'
