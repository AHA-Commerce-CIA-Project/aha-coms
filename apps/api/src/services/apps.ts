import { db } from '~/db'
import { appRegistry } from '~/db/schema'
import { eq } from 'drizzle-orm'
import type { NewAppRegistry } from '~/db/schema'
import { DEFAULT_AUTH_TRANSPORT_MODE, PLATFORM_AUTH_CONTRACT_VERSION } from '@coms-portal/shared/contracts/auth'

type AppRegistryWrite = Omit<NewAppRegistry, 'id' | 'createdAt' | 'updatedAt'>
type AppRegistryUpdate = Partial<AppRegistryWrite>

interface AppIntegrationMetadata {
  adapterType: NonNullable<AppRegistryWrite['adapterType']>
  transportMode: NonNullable<AppRegistryWrite['transportMode']>
  handoffMode: NonNullable<AppRegistryWrite['handoffMode']>
  brokerOrigin: AppRegistryWrite['brokerOrigin'] | null
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

export function resolveAppIntegrationMetadata(input: AppRegistryUpdate): AppIntegrationMetadata {
  const transportMode = input.transportMode ?? DEFAULT_AUTH_TRANSPORT_MODE

  return {
    adapterType: input.adapterType ?? 'server_middleware',
    transportMode,
    handoffMode:
      input.handoffMode ?? (transportMode === 'same_host_cookie' ? 'none' : 'one_time_code'),
    brokerOrigin: input.brokerOrigin ?? null,
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
  data: AppRegistryWrite,
): Promise<{ id: string }> {
  const normalizedMetadata = resolveAppIntegrationMetadata(data)
  assertValidAppIntegrationMetadata(normalizedMetadata)
  const [app] = await db.insert(appRegistry).values(data).returning({ id: appRegistry.id })
  return { id: app.id }
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
  await db
    .update(appRegistry)
    .set({ status: 'deprecated', updatedAt: new Date() })
    .where(eq(appRegistry.id, appId))
}
