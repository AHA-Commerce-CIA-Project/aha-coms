import type { PortalRole } from './auth'

export const PORTAL_WEBHOOK_CONTRACT_VERSION = 1 as const

export const PORTAL_WEBHOOK_EVENTS = [
  'session.revoked',
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
}

export interface UserOffboardedPayload {
  userId: string
  gipUid: string | null
  email: string
  /** ISO */
  offboardedAt: string
}

export const PORTAL_WEBHOOK_SIGNATURE_HEADER = 'X-Portal-Signature'
export const PORTAL_WEBHOOK_EVENT_HEADER = 'X-Portal-Event'
export const PORTAL_WEBHOOK_EVENT_ID_HEADER = 'X-Portal-Event-Id'
export const PORTAL_WEBHOOK_TIMESTAMP_HEADER = 'X-Portal-Timestamp'
