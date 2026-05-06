import { eq } from 'drizzle-orm'
import type { UserUpdatedPayload } from '@coms-portal/shared'
import { db } from '@coms/shared/db'
import { emailCache, heroesProfiles } from '@coms/shared/db/schema'
import type { PortalEventHandler } from './dispatch'

interface SpecUserUpdatedPayload {
  user: { portalSub: string; name?: string }
  contactEmail?: string
  changedFields?: string[]
}

export const handleUserUpdated: PortalEventHandler = async (body) => {
  const legacy = body as Partial<UserUpdatedPayload> & SpecUserUpdatedPayload
  const portalSub = legacy.user?.portalSub
  if (!portalSub) {
    console.warn('[handle-user-updated] payload missing user.portalSub, skipping')
    return
  }

  const profileUpdate: Record<string, unknown> = {}
  const nameUpdate = legacy.user?.name
  if (nameUpdate) profileUpdate.name = nameUpdate

  // Mirror the per-app role from member_app_role into heroes_profiles.role.
  // This is the canonical signal for admin/captain/employee — set whenever
  // 'appRole' is among changedFields, OR (defensively) any time the legacy
  // appRole field is present, since the portal dual-emits it through PR 07-5.
  if (legacy.appRole !== undefined && legacy.appRole !== null) {
    profileUpdate.role = legacy.appRole
  }

  if (Object.keys(profileUpdate).length > 0) {
    profileUpdate.updatedAt = new Date()
    await db
      .update(heroesProfiles)
      .set(profileUpdate)
      .where(eq(heroesProfiles.id, portalSub))
  }

  if (legacy.contactEmail) {
    await db
      .insert(emailCache)
      .values({ portalSub, contactEmail: legacy.contactEmail })
      .onConflictDoUpdate({
        target: emailCache.portalSub,
        set: { contactEmail: legacy.contactEmail, cachedAt: new Date() },
      })
  }
}
