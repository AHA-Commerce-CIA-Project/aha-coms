import type { WebhookUserEnvelope } from '@coms-portal/shared'
import { db } from '@coms/shared/db'
import { emailCache, heroesProfiles, userConfigCache } from '@coms/shared/db/schema'
import type { PortalEventHandler } from './dispatch'
import {
  envelopeToEmailCacheRow,
  envelopeToHeroesProfileRow,
  envelopeToUserConfigCacheRow,
} from './payload-projection'

export const handleUserProvisioned: PortalEventHandler = async (body) => {
  const envelope = body as WebhookUserEnvelope
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

  const configRow = envelopeToUserConfigCacheRow(envelope)
  if (configRow) {
    await db
      .insert(userConfigCache)
      .values(configRow)
      .onConflictDoUpdate({
        target: userConfigCache.portalSub,
        set: {
          config: configRow.config,
          schemaVersion: configRow.schemaVersion,
          cachedAt: new Date(),
        },
      })
  }
}
