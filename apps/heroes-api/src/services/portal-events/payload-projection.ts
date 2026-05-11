import type {
  EmploymentBlock,
  EmploymentUpdatedPayload,
  TaxonomyRef,
  WebhookUserEnvelope,
} from '@coms-portal/sdk'

/**
 * The portal dual-emits the legacy `appRole` field at the top level of the
 * `user.provisioned` / `user.updated` payload alongside the Spec 07 envelope
 * keys (until PR 07-5). Heroes-side projection reads it through this shape.
 *
 * Once PR 07-5 lands and the legacy field disappears, role will travel inside
 * `appConfig.config.role` *only when an app declares role in its configSchema*
 * — Heroes will need to derive role from a different signal (likely a new
 * top-level `roles: Record<appSlug, string>` field). Update this type and
 * `envelopeToHeroesProfileRow` together when that day arrives.
 */
export type WebhookUserEnvelopeWithRole = WebhookUserEnvelope & {
  appRole?: string | null
}

export interface HeroesProfileRow {
  id: string
  name: string
  branchKey: string | null
  branchValueSnapshot: string | null
  teamKey: string | null
  teamValueSnapshot: string | null
  departmentKey: string | null
  departmentValueSnapshot: string | null
  position: string | null
  phone: string | null
  employmentStatus: string | null
  role: string
  talentaId: string | null
  attendanceName: string | null
  isActive: boolean
}

export interface EmailCacheRow {
  portalSub: string
  contactEmail: string
}

export interface UserConfigCacheRow {
  portalSub: string
  config: Record<string, unknown>
  schemaVersion: number
}

function refKey(ref: TaxonomyRef | null | undefined): string | null {
  return ref?.key ?? null
}

function refValue(ref: TaxonomyRef | null | undefined): string | null {
  return ref?.value ?? null
}

export function envelopeToHeroesProfileRow(
  envelope: WebhookUserEnvelopeWithRole,
): HeroesProfileRow {
  const e = envelope.employment
  return {
    id: envelope.user.portalSub,
    name: envelope.user.name,
    branchKey: refKey(e?.branch),
    branchValueSnapshot: refValue(e?.branch),
    teamKey: refKey(e?.team),
    teamValueSnapshot: refValue(e?.team),
    departmentKey: refKey(e?.department),
    departmentValueSnapshot: refValue(e?.department),
    position: e?.position ?? null,
    phone: e?.phone ?? null,
    employmentStatus: e?.employmentStatus ?? null,
    role: envelope.appRole ?? 'employee',
    talentaId: e?.talentaId ?? null,
    attendanceName: e?.attendanceName ?? null,
    isActive: true,
  }
}

export function envelopeToEmailCacheRow(envelope: WebhookUserEnvelope): EmailCacheRow {
  return {
    portalSub: envelope.user.portalSub,
    contactEmail: envelope.contactEmail,
  }
}

export function envelopeToUserConfigCacheRow(
  envelope: WebhookUserEnvelope,
): UserConfigCacheRow | null {
  if (!envelope.appConfig) return null
  return {
    portalSub: envelope.user.portalSub,
    config: envelope.appConfig.config,
    schemaVersion: envelope.appConfig.schemaVersion,
  }
}

export interface EmploymentDenormUpdate {
  branchKey?: string | null
  branchValueSnapshot?: string | null
  teamKey?: string | null
  teamValueSnapshot?: string | null
  departmentKey?: string | null
  departmentValueSnapshot?: string | null
  position?: string | null
  phone?: string | null
  employmentStatus?: string | null
  talentaId?: string | null
  attendanceName?: string | null
}

const EMPLOYMENT_FIELDS = [
  'branch',
  'team',
  'department',
  'position',
  'phone',
  'employmentStatus',
  'talentaId',
  'attendanceName',
] as const

type EmploymentField = (typeof EMPLOYMENT_FIELDS)[number]

function isTaxonomyField(field: EmploymentField): boolean {
  return field === 'branch' || field === 'team' || field === 'department'
}

export function employmentUpdatedToDenormFields(
  payload: EmploymentUpdatedPayload,
): EmploymentDenormUpdate {
  const next = payload.employment as Partial<EmploymentBlock>
  const update: EmploymentDenormUpdate = {}
  for (const field of EMPLOYMENT_FIELDS) {
    if (!(field in next)) continue
    const value = next[field]
    if (isTaxonomyField(field)) {
      const ref = value as TaxonomyRef | null
      if (field === 'branch') {
        update.branchKey = refKey(ref)
        update.branchValueSnapshot = refValue(ref)
      } else if (field === 'team') {
        update.teamKey = refKey(ref)
        update.teamValueSnapshot = refValue(ref)
      } else {
        update.departmentKey = refKey(ref)
        update.departmentValueSnapshot = refValue(ref)
      }
    } else {
      ;(update as Record<string, string | null>)[field] = (value as string | null) ?? null
    }
  }
  return update
}
