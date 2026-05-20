// Real implementation of the manifests service. The public face is
// `./manifests`, which re-exports from this file. Production code imports
// from `./manifests` (or `~/services/manifests`); test files that need to
// stub the manifests service mock those specifiers.
//
// `manifests.test.ts` exercises the real implementation by importing from
// this file directly. That bypass is necessary because Bun's `mock.module`
// is process-global and keyed by resolved absolute path: when a test file
// (e.g. `app-user-config.test.ts`, `app-manifest.test.ts`) mocks
// `'../manifests'` / `'~/services/manifests'`, the cached module is
// reused for every later test in the same `bun test` invocation —
// including `manifests.test.ts`, which would otherwise see the polluted
// surface. Importing `'../manifests-internal'` lands on a different
// absolute path, so the polluters' mocks do not apply.

import { db } from '~/db'
import { appManifests } from '~/db/schema/app-manifests'
import { appRegistry } from '~/db/schema/apps'
import { eq, sql } from 'drizzle-orm'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FieldType = 'enum' | 'boolean' | 'integer' | 'string'

interface EnumField {
  type: 'enum'
  values: string[]
  default: string
}

interface BooleanField {
  type: 'boolean'
  default: boolean
}

interface IntegerField {
  type: 'integer'
  default: number
}

interface StringField {
  type: 'string'
  default: string
}

type ConfigField = EnumField | BooleanField | IntegerField | StringField

export interface ManifestDefinition {
  appId: string
  displayName: string
  schemaVersion: number
  configSchema: Record<string, ConfigField>
  /**
   * Spec 07: list of `taxonomy_id`s the app subscribes to. Portal uses this at
   * registration time (initial sync) and webhook fan-out (only fires events
   * for taxonomies the app subscribes to). Defaults to `[]` when absent.
   */
  taxonomies?: string[]
}

export type ValidationResult =
  | { valid: true }
  | { valid: false; errors: { key: string; reason: string }[] }

// ---------------------------------------------------------------------------
// validateConfig
// ---------------------------------------------------------------------------

export function validateConfig(
  manifest: ManifestDefinition,
  config: Record<string, unknown>,
): ValidationResult {
  const errors: { key: string; reason: string }[] = []

  for (const [key, field] of Object.entries(manifest.configSchema)) {
    const value = config[key]
    if (value === undefined || value === null) {
      errors.push({ key, reason: 'missing required key' })
      continue
    }

    switch (field.type) {
      case 'enum':
        if (typeof value !== 'string' || !field.values.includes(value)) {
          errors.push({ key, reason: `must be one of: ${field.values.join(', ')}` })
        }
        break
      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push({ key, reason: 'must be a boolean' })
        }
        break
      case 'integer':
        if (typeof value !== 'number' || !Number.isInteger(value)) {
          errors.push({ key, reason: 'must be an integer' })
        }
        break
      case 'string':
        if (typeof value !== 'string') {
          errors.push({ key, reason: 'must be a string' })
        }
        break
    }
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors }
}

// ---------------------------------------------------------------------------
// validateConfigSchemaShape — Spec 03d D12. Used by the admin App Registry
// register-app endpoint to reject malformed configSchema payloads before they
// land in app_manifests. Returns one entry per malformed field; empty array
// means the schema is well-formed.
// ---------------------------------------------------------------------------

const FIELD_TYPES = new Set<FieldType>(['enum', 'boolean', 'integer', 'string'])

export function validateConfigSchemaShape(
  schema: unknown,
): { key: string; reason: string }[] {
  if (
    schema === null ||
    typeof schema !== 'object' ||
    Array.isArray(schema)
  ) {
    return [{ key: '<root>', reason: 'configSchema must be a JSON object' }]
  }

  const errors: { key: string; reason: string }[] = []

  for (const [key, raw] of Object.entries(schema as Record<string, unknown>)) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      errors.push({ key, reason: 'field definition must be an object' })
      continue
    }

    const field = raw as Record<string, unknown>
    const type = field.type

    if (typeof type !== 'string' || !FIELD_TYPES.has(type as FieldType)) {
      errors.push({
        key,
        reason: `type must be one of: ${[...FIELD_TYPES].join(', ')}`,
      })
      continue
    }

    if (!('default' in field)) {
      errors.push({ key, reason: 'default is required' })
      continue
    }

    switch (type) {
      case 'enum': {
        const values = field.values
        if (!Array.isArray(values) || values.length === 0 || !values.every((v) => typeof v === 'string')) {
          errors.push({ key, reason: 'enum field requires non-empty values: string[]' })
          break
        }
        if (typeof field.default !== 'string' || !values.includes(field.default as string)) {
          errors.push({ key, reason: 'enum default must be one of values' })
        }
        break
      }
      case 'boolean':
        if (typeof field.default !== 'boolean') {
          errors.push({ key, reason: 'boolean default must be a boolean' })
        }
        break
      case 'integer':
        if (typeof field.default !== 'number' || !Number.isInteger(field.default)) {
          errors.push({ key, reason: 'integer default must be an integer' })
        }
        break
      case 'string':
        if (typeof field.default !== 'string') {
          errors.push({ key, reason: 'string default must be a string' })
        }
        break
    }
  }

  return errors
}

// ---------------------------------------------------------------------------
// seedDefaults — pure, no DB access
// ---------------------------------------------------------------------------

export function seedDefaults(manifest: ManifestDefinition): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(manifest.configSchema)) {
    result[key] = field.default
  }
  return result
}

// ---------------------------------------------------------------------------
// registerManifest — idempotent upsert keyed on appId slug
// Resolves the app_registry uuid from slug, then upserts app_manifests.
// schemaVersion is only bumped if the incoming value is strictly higher.
// ---------------------------------------------------------------------------

export async function registerManifest(manifest: ManifestDefinition): Promise<void> {
  const [app] = await db
    .select({ id: appRegistry.id })
    .from(appRegistry)
    .where(eq(appRegistry.slug, manifest.appId))
    .limit(1)

  if (!app) {
    throw new Error(`registerManifest: app_registry row not found for slug "${manifest.appId}"`)
  }

  const taxonomies = manifest.taxonomies ?? []

  await db
    .insert(appManifests)
    .values({
      appId: app.id,
      displayName: manifest.displayName,
      configSchema: manifest.configSchema,
      schemaVersion: manifest.schemaVersion,
      taxonomies,
    })
    .onConflictDoUpdate({
      target: appManifests.appId,
      set: {
        displayName: manifest.displayName,
        configSchema: manifest.configSchema,
        // Only advance schemaVersion, never regress it.
        schemaVersion: sql`GREATEST(app_manifests.schema_version, ${manifest.schemaVersion})`,
        taxonomies,
        updatedAt: sql`now()`,
      },
    })
}

// ---------------------------------------------------------------------------
// loadAllManifests — returns every registered manifest row from the DB
// ---------------------------------------------------------------------------

export async function loadAllManifests(): Promise<(typeof appManifests.$inferSelect)[]> {
  // defensive: app_manifests has exactly one row per registered app; the
  // catalogue is bounded by the count of platform-integrated apps (~5 today).
  // A hard ceiling of 200 is chosen to match the outer app_registry limit and
  // to prevent an unbounded scan if stale/duplicate rows accumulate before a
  // cleanup migration runs. No legitimate codepath needs more than 200 manifest
  // entries in a single call.
  return db.select().from(appManifests).limit(200)
}
