import { eq, and, ilike, count } from 'drizzle-orm'
import { heroesProfiles, emailCache, userConfigCache } from '@coms/shared/db/schema'
import type { DbClient } from './base'
import { getDb } from './base'
import type { UserRole } from '@coms/shared/constants'

export type UserRow = {
  id: string
  name: string
  email: string | null
  role: UserRole | null
  branchKey: string | null
  teamKey: string | null
  position: string | null
  avatarUrl: string | null
  talentaId: string | null
  isActive: boolean
  archivedAt: Date | null
  canSubmitPoints: boolean | null
}

type ListUsersOpts = {
  readonly page: number
  readonly limit: number
  readonly role?: UserRole
  readonly teamId?: string
  readonly search?: string
  readonly isActive?: boolean
  readonly department?: string
  readonly position?: string
  readonly branchId?: string
}

export async function listUsers(opts: ListUsersOpts, tx?: DbClient) {
  const db = getDb(tx)
  const conditions = []

  if (opts.isActive !== undefined) conditions.push(eq(heroesProfiles.isActive, opts.isActive))
  if (opts.search) conditions.push(ilike(heroesProfiles.name, `%${opts.search}%`))
  if (opts.teamId) conditions.push(eq(heroesProfiles.teamKey, opts.teamId))
  if (opts.branchId) conditions.push(eq(heroesProfiles.branchKey, opts.branchId))
  if (opts.position) conditions.push(ilike(heroesProfiles.position, `%${opts.position}%`))

  const where = conditions.length > 0 ? and(...conditions) : undefined
  const offset = (opts.page - 1) * opts.limit

  const [rawRows, [{ total }]] = await Promise.all([
    db
      .select({
        id: heroesProfiles.id,
        name: heroesProfiles.name,
        email: emailCache.contactEmail,
        configJson: userConfigCache.config,
        role: heroesProfiles.role,
        branchKey: heroesProfiles.branchKey,
        teamKey: heroesProfiles.teamKey,
        position: heroesProfiles.position,
        avatarUrl: heroesProfiles.avatarUrl,
        talentaId: heroesProfiles.talentaId,
        isActive: heroesProfiles.isActive,
        archivedAt: heroesProfiles.archivedAt,
      })
      .from(heroesProfiles)
      .leftJoin(emailCache, eq(heroesProfiles.id, emailCache.portalSub))
      .leftJoin(userConfigCache, eq(heroesProfiles.id, userConfigCache.portalSub))
      .where(where)
      .orderBy(heroesProfiles.name)
      .limit(opts.limit)
      .offset(offset),
    db.select({ total: count() }).from(heroesProfiles).where(where),
  ])

  const rows: UserRow[] = rawRows.map((r) => {
    const cfg = r.configJson as Record<string, unknown> | null
    return {
      id: r.id,
      name: r.name,
      email: r.email ?? null,
      role: (r.role ?? null) as UserRole | null,
      branchKey: r.branchKey ?? null,
      teamKey: r.teamKey ?? null,
      position: r.position ?? null,
      avatarUrl: r.avatarUrl ?? null,
      talentaId: r.talentaId ?? null,
      isActive: r.isActive,
      archivedAt: r.archivedAt ?? null,
      canSubmitPoints: (cfg?.canSubmitPoints ?? null) as boolean | null,
    }
  })

  return { rows, total }
}

export async function getUserById(id: string, tx?: DbClient): Promise<UserRow | null> {
  const db = getDb(tx)
  const [row] = await db
    .select({
      id: heroesProfiles.id,
      name: heroesProfiles.name,
      email: emailCache.contactEmail,
      configJson: userConfigCache.config,
      role: heroesProfiles.role,
      branchKey: heroesProfiles.branchKey,
      teamKey: heroesProfiles.teamKey,
      position: heroesProfiles.position,
      avatarUrl: heroesProfiles.avatarUrl,
      talentaId: heroesProfiles.talentaId,
      isActive: heroesProfiles.isActive,
      archivedAt: heroesProfiles.archivedAt,
    })
    .from(heroesProfiles)
    .leftJoin(emailCache, eq(heroesProfiles.id, emailCache.portalSub))
    .leftJoin(userConfigCache, eq(heroesProfiles.id, userConfigCache.portalSub))
    .where(eq(heroesProfiles.id, id))
    .limit(1)

  if (!row) return null
  const cfg = row.configJson as Record<string, unknown> | null
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? null,
    role: (row.role ?? null) as UserRole | null,
    branchKey: row.branchKey ?? null,
    teamKey: row.teamKey ?? null,
    position: row.position ?? null,
    avatarUrl: row.avatarUrl ?? null,
    talentaId: row.talentaId ?? null,
    isActive: row.isActive,
    archivedAt: row.archivedAt ?? null,
    canSubmitPoints: (cfg?.canSubmitPoints ?? null) as boolean | null,
  }
}

export async function getUserByEmail(email: string, tx?: DbClient): Promise<UserRow | null> {
  const db = getDb(tx)
  const [row] = await db
    .select({
      id: heroesProfiles.id,
      name: heroesProfiles.name,
      email: emailCache.contactEmail,
      configJson: userConfigCache.config,
      role: heroesProfiles.role,
      branchKey: heroesProfiles.branchKey,
      teamKey: heroesProfiles.teamKey,
      position: heroesProfiles.position,
      avatarUrl: heroesProfiles.avatarUrl,
      talentaId: heroesProfiles.talentaId,
      isActive: heroesProfiles.isActive,
      archivedAt: heroesProfiles.archivedAt,
    })
    .from(emailCache)
    .innerJoin(heroesProfiles, eq(emailCache.portalSub, heroesProfiles.id))
    .leftJoin(userConfigCache, eq(heroesProfiles.id, userConfigCache.portalSub))
    .where(eq(emailCache.contactEmail, email))
    .limit(1)

  if (!row) return null
  const cfg = row.configJson as Record<string, unknown> | null
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? null,
    role: (row.role ?? null) as UserRole | null,
    branchKey: row.branchKey ?? null,
    teamKey: row.teamKey ?? null,
    position: row.position ?? null,
    avatarUrl: row.avatarUrl ?? null,
    talentaId: row.talentaId ?? null,
    isActive: row.isActive,
    archivedAt: row.archivedAt ?? null,
    canSubmitPoints: (cfg?.canSubmitPoints ?? null) as boolean | null,
  }
}

export async function archiveUser(id: string, tx?: DbClient): Promise<UserRow | null> {
  const db = getDb(tx)
  await db
    .update(heroesProfiles)
    .set({ isActive: false, archivedAt: new Date() })
    .where(eq(heroesProfiles.id, id))
  return getUserById(id, tx)
}

export async function activateUser(id: string, tx?: DbClient): Promise<UserRow | null> {
  const db = getDb(tx)
  await db
    .update(heroesProfiles)
    .set({ isActive: true, archivedAt: null })
    .where(eq(heroesProfiles.id, id))
  return getUserById(id, tx)
}
