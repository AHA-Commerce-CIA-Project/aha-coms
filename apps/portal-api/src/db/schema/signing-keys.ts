import { pgTable, varchar, jsonb, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { JWK } from 'jose'

/**
 * Portal broker signing keys (Rev 2 §01).
 *
 * One row per generated ES256 keypair. The private half lives in Secret
 * Manager — only its name is stored here (`privateSecretName`). The public
 * half is stored as a JWK so the JWKS endpoint can serve it without a
 * Secret Manager round-trip.
 *
 * Status state machine:
 *   created → active → retiring → retired
 *
 * The partial unique index `one_active_signing_key` enforces "exactly one
 * active key at a time" at the database level — rotation depends on this
 * invariant for correctness.
 *
 * The partial index `signing_keys_jwks_set` keeps the JWKS-publish query
 * cheap: typically (1 active) + (0..1 retiring) rows.
 */
export const portalBrokerSigningKeys = pgTable(
  'portal_broker_signing_keys',
  {
    kid: varchar('kid', { length: 40 }).primaryKey(),
    alg: varchar('alg', { length: 10 }).notNull(),
    publicJwk: jsonb('public_jwk').$type<JWK>().notNull(),
    privateSecretName: varchar('private_secret_name', { length: 200 }).notNull(),
    status: varchar('status', { length: 20 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('one_active_signing_key')
      .on(t.status)
      .where(sql`${t.status} = 'active'`),
    index('signing_keys_jwks_set')
      .on(t.status)
      .where(sql`${t.status} IN ('active', 'retiring')`),
  ],
)

export type PortalBrokerSigningKey = typeof portalBrokerSigningKeys.$inferSelect
export type NewPortalBrokerSigningKey = typeof portalBrokerSigningKeys.$inferInsert

export const SIGNING_KEY_STATUS = {
  CREATED: 'created',
  ACTIVE: 'active',
  RETIRING: 'retiring',
  RETIRED: 'retired',
} as const

export type SigningKeyStatus = (typeof SIGNING_KEY_STATUS)[keyof typeof SIGNING_KEY_STATUS]
