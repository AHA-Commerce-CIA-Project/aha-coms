import { db } from '~/db'
import { appRegistry, appManifests } from '~/db/schema'
import { eq } from 'drizzle-orm'
import type { NewAppRegistry } from '~/db/schema'
import { DEFAULT_AUTH_TRANSPORT_MODE, PLATFORM_AUTH_CONTRACT_VERSION } from '@coms-portal/shared/contracts/auth'
import { validateConfigSchemaShape } from './manifests'

type AppRegistryWrite = Omit<NewAppRegistry, 'id' | 'createdAt' | 'updatedAt'>
type AppRegistryUpdate = Partial<AppRegistryWrite>

/**
 * Spec 03d D12 — optional manifest payload accepted alongside the app_registry
 * row. When `configSchema` is empty (or this whole field is omitted), no
 * app_manifests row is written and the app boots without managed config —
 * this is the explicit "manifest is optional" path.
 */
export interface AppManifestRegistration {
  configSchema: Record<string, unknown>
  schemaVersion?: number
  taxonomies?: string[]
}

/**
 * Spec 07 PR 07-5 — minimum manifest schemaVersion. v1 was the pre-Spec-07
 * shape (no taxonomies array, no envelope-aware H-app); every newly registered
 * manifest must declare v2 or higher. Existing rows are migrated forward.
 */
export const MIN_MANIFEST_SCHEMA_VERSION = 2 as const

interface AppIntegrationMetadata {
  adapterType: NonNullable<AppRegistryWrite['adapterType']>
  transportMode: NonNullable<AppRegistryWrite['transportMode']>
  handoffMode: NonNullable<AppRegistryWrite['handoffMode']>
  brokerOrigin: AppRegistryWrite['brokerOrigin'] | null
  brokerSigningSecret: string | null
  contractVersion: number
  complianceStatus: NonNullable<AppRegistryWrite['complianceStatus']>
  manifestPath: AppRegistryWrite['manifestPath'] | null
  lastVerifiedAt: AppRegistryWrite['lastVerifiedAt'] | null
}

export class AppIntegrationValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(errors[0] ?? 'Invalid app integration metadata')
    this.name = 'AppIntegrationValidationError'
  }
}

export class AppManifestValidationError extends Error {
  constructor(public readonly errors: { key: string; reason: string }[]) {
    super(errors[0] ? `${errors[0].key}: ${errors[0].reason}` : 'Invalid manifest configSchema')
    this.name = 'AppManifestValidationError'
  }
}

export function resolveAppIntegrationMetadata(input: AppRegistryUpdate): AppIntegrationMetadata {
  const transportMode = input.transportMode ?? DEFAULT_AUTH_TRANSPORT_MODE

  return {
    adapterType: input.adapterType ?? 'server_middleware',
    transportMode,
    handoffMode:
      input.handoffMode ?? (transportMode === 'same_host_cookie' ? 'none' : 'one_time_code'),
    brokerOrigin: input.brokerOrigin ?? null,
    brokerSigningSecret: input.brokerSigningSecret ?? null,
    contractVersion: input.contractVersion ?? PLATFORM_AUTH_CONTRACT_VERSION,
    complianceStatus: input.complianceStatus ?? 'draft',
    manifestPath: input.manifestPath ?? null,
    lastVerifiedAt: input.lastVerifiedAt ?? null,
  }
}

export function validateAppIntegrationMetadata(metadata: AppIntegrationMetadata): string[] {
  const errors: string[] = []

  if (metadata.contractVersion < 1) {
    errors.push('contractVersion must be at least 1')
  }

  if (metadata.transportMode === 'same_host_cookie' && metadata.handoffMode !== 'none') {
    errors.push('same_host_cookie transport requires handoffMode to be none')
  }

  if (metadata.transportMode === 'same_host_cookie' && metadata.brokerOrigin) {
    errors.push('same_host_cookie transport must not set brokerOrigin')
  }

  if (metadata.transportMode === 'portable_token' && metadata.handoffMode === 'none') {
    errors.push('portable_token transport requires a brokered handoff mode')
  }

  if (metadata.transportMode === 'portable_token' && !metadata.brokerOrigin?.trim()) {
    errors.push('portable_token transport requires brokerOrigin')
  }

  const needsManifest = !['draft', 'deprecated'].includes(metadata.complianceStatus)
  if (needsManifest && !metadata.manifestPath?.trim()) {
    errors.push('complianceStatus requires manifestPath')
  }

  if (metadata.complianceStatus === 'compliant' && !metadata.lastVerifiedAt) {
    errors.push('compliant apps require lastVerifiedAt')
  }

  return errors
}

function assertValidAppIntegrationMetadata(metadata: AppIntegrationMetadata): void {
  const errors = validateAppIntegrationMetadata(metadata)
  if (errors.length > 0) {
    throw new AppIntegrationValidationError(errors)
  }
}

export async function registerApp(
  data: AppRegistryWrite & { manifest?: AppManifestRegistration },
): Promise<{ id: string }> {
  const { manifest, ...appData } = data
  const normalizedMetadata = resolveAppIntegrationMetadata(appData)
  assertValidAppIntegrationMetadata(normalizedMetadata)

  const writesManifest =
    manifest !== undefined &&
    typeof manifest.configSchema === 'object' &&
    manifest.configSchema !== null &&
    Object.keys(manifest.configSchema).length > 0

  if (writesManifest) {
    const shapeErrors = validateConfigSchemaShape(manifest.configSchema)
    if (shapeErrors.length > 0) {
      throw new AppManifestValidationError(shapeErrors)
    }
    const declaredVersion = manifest.schemaVersion ?? MIN_MANIFEST_SCHEMA_VERSION
    if (declaredVersion < MIN_MANIFEST_SCHEMA_VERSION) {
      throw new AppManifestValidationError([
        {
          key: 'schemaVersion',
          reason: `must be at least ${MIN_MANIFEST_SCHEMA_VERSION}`,
        },
      ])
    }
  }

  return db.transaction(async (tx) => {
    const [app] = await tx
      .insert(appRegistry)
      .values(appData)
      .returning({ id: appRegistry.id })

    if (writesManifest) {
      await tx.insert(appManifests).values({
        appId: app.id,
        displayName: appData.name,
        configSchema: manifest.configSchema,
        schemaVersion: manifest.schemaVersion ?? MIN_MANIFEST_SCHEMA_VERSION,
        taxonomies: manifest.taxonomies ?? [],
      })
    }

    return { id: app.id }
  })
}

export async function updateApp(
  appId: string,
  data: AppRegistryUpdate,
): Promise<void> {
  const existing = await db.query.appRegistry.findFirst({
    where: eq(appRegistry.id, appId),
  })

  if (!existing) {
    throw new Error('App not found')
  }

  const normalizedMetadata = resolveAppIntegrationMetadata({
    adapterType: existing.adapterType,
    transportMode: existing.transportMode,
    handoffMode: existing.handoffMode,
    brokerOrigin: existing.brokerOrigin,
    contractVersion: existing.contractVersion,
    complianceStatus: existing.complianceStatus,
    manifestPath: existing.manifestPath,
    lastVerifiedAt: existing.lastVerifiedAt,
    ...data,
  })

  assertValidAppIntegrationMetadata(normalizedMetadata)

  await db
    .update(appRegistry)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(appRegistry.id, appId))
}

export async function deregisterApp(appId: string): Promise<void> {
  await db.delete(appRegistry).where(eq(appRegistry.id, appId))
}
