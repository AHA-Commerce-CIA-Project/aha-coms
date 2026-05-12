import { db } from '@coms-portal/heroes-shared/db'
import { emailCache, heroesProfiles } from '@coms-portal/heroes-shared/db/schema'
import type { PortalEventHandler } from './dispatch'
import {
  envelopeToEmailCacheRow,
  envelopeToHeroesProfileRow,
  type WebhookUserEnvelopeWithRole,
} from './payload-projection'

export const handleUserProvisioned: PortalEventHandler = async (body) => {
  const envelope = body as WebhookUserEnvelopeWithRole
  const profileRow = envelopeToHeroesProfileRow(envelope)

  await db
    .insert(heroesProfiles)
    .values(profileRow)
    .onConflictDoUpdate({
      target: heroesProfiles.id,
      set: {
        name: profileRow.name,
        branchKey: profileRow.branchKey,
        branchValueSnapshot: profileRow.branchValueSnapshot,
        teamKey: profileRow.teamKey,
        teamValueSnapshot: profileRow.teamValueSnapshot,
        departmentKey: profileRow.departmentKey,
        departmentValueSnapshot: profileRow.departmentValueSnapshot,
        position: profileRow.position,
        phone: profileRow.phone,
        employmentStatus: profileRow.employmentStatus,
        role: profileRow.role,
        canSubmitPoints: profileRow.canSubmitPoints,
        talentaId: profileRow.talentaId,
        attendanceName: profileRow.attendanceName,
        isActive: profileRow.isActive,
        updatedAt: new Date(),
      },
    })

  const emailRow = envelopeToEmailCacheRow(envelope)
  await db
    .insert(emailCache)
    .values(emailRow)
    .onConflictDoUpdate({
      target: emailCache.portalSub,
      set: { contactEmail: emailRow.contactEmail, cachedAt: new Date() },
    })
}
