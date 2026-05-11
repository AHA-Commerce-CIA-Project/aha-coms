import type {
  PortalWebhookEvent,
  SessionRevokedPayload,
  UserProvisionedPayload,
  UserUpdatedPayload,
  UserOffboardedPayload,
  AliasResolvedPayload,
  AliasUpdatedPayload,
  AliasDeletedPayload,
  AppConfigUpdatedPayload,
  EmploymentUpdatedPayload,
  TaxonomyUpsertedPayload,
  TaxonomyDeletedPayload,
} from '@coms-portal/shared/contracts/webhook-events'

/**
 * Source-of-truth mapping from `PortalWebhookEvent` discriminator to its
 * matching payload interface. Used by `defineWebhookHandler` to type
 * per-event handler signatures and by `PayloadFor<E>` for general use.
 */
export interface EventPayloadMap {
  'session.revoked': SessionRevokedPayload
  'user.provisioned': UserProvisionedPayload
  'user.updated': UserUpdatedPayload
  'user.offboarded': UserOffboardedPayload
  'alias.resolved': AliasResolvedPayload
  'alias.updated': AliasUpdatedPayload
  'alias.deleted': AliasDeletedPayload
  'app_config.updated': AppConfigUpdatedPayload
  'employment.updated': EmploymentUpdatedPayload
  'taxonomy.upserted': TaxonomyUpsertedPayload
  'taxonomy.deleted': TaxonomyDeletedPayload
  // Spec 06 onboarding probe — receivers ack 2xx without business-side
  // processing. Payload shape matches portal-api's dispatch at
  // apps/api/src/routes/app-smoketest.ts.
  'app.smoketest': { note: string }
}

export type PayloadFor<E extends PortalWebhookEvent> = EventPayloadMap[E]
