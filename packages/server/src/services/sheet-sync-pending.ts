import { eq, sql } from 'drizzle-orm'
import { db } from '@coms/shared/db'
import {
  pendingAliasResolution,
  achievementPoints,
  redemptions,
  heroesProfiles,
  pointCategories,
  rewards,
} from '@coms/shared/db/schema'
import { parseTimestamp, parseReward } from './sheet-sync-helpers'

export interface PendingAliasRow {
  id: string
  sheetId: string
  sheetRowNumber: number
  rawName: string
  rawNameNormalized: string
  rawPayload: unknown
}

// ── Payload discriminators ───────────────────────────────────────────────────
//
// The rawPayload was stored by sheet-sync with type-specific fields.
// We discriminate by presence of characteristic keys:
//   points payload     → has 'timestamp' + 'reason' (not 'reward')
//   redemption payload → has 'timestamp' + 'reward'
//   employee payload   → no 'timestamp'
//

function isPointsPayload(p: unknown): p is {
  name: string
  timestamp: string
  reason: string
  screenshot: string | null
  points: number
} {
  return (
    typeof p === 'object' &&
    p !== null &&
    'timestamp' in p &&
    'reason' in p &&
    !('reward' in p)
  )
}

function isRedemptionPayload(p: unknown): p is {
  name: string
  timestamp: string
  reward: string
  notes: string | null
} {
  return (
    typeof p === 'object' &&
    p !== null &&
    'timestamp' in p &&
    'reward' in p
  )
}

// ── Dependency injection seam ────────────────────────────────────────────────

export type DrainDeps = {
  fetchPending: (rawNameNormalized: string) => Promise<PendingAliasRow[]>
  markResolved: (id: string) => Promise<void>
  markFailed: (id: string) => Promise<void>
  insertPoint: (row: PendingAliasRow, portalSub: string) => Promise<void>
  insertRedemption: (row: PendingAliasRow, portalSub: string) => Promise<void>
  upsertProfile: (row: PendingAliasRow, portalSub: string) => Promise<void>
  lookupCategory: (code: string) => Promise<{ id: string; code: string } | null>
}

// ── Default DB implementations ───────────────────────────────────────────────

function defaultFetchPending(rawNameNormalized: string): Promise<PendingAliasRow[]> {
  return db
    .select({
      id: pendingAliasResolution.id,
      sheetId: pendingAliasResolution.sheetId,
      sheetRowNumber: pendingAliasResolution.sheetRowNumber,
      rawName: pendingAliasResolution.rawName,
      rawNameNormalized: pendingAliasResolution.rawNameNormalized,
      rawPayload: pendingAliasResolution.rawPayload,
    })
    .from(pendingAliasResolution)
    .where(
      sql`${pendingAliasResolution.rawNameNormalized} = ${rawNameNormalized}
          AND ${pendingAliasResolution.status} = 'pending'`,
    )
}

async function defaultMarkResolved(id: string): Promise<void> {
  await db
    .update(pendingAliasResolution)
    .set({
      status: 'resolved',
      lastRetryAt: new Date(),
      retryCount: sql`${pendingAliasResolution.retryCount} + 1`,
    })
    .where(eq(pendingAliasResolution.id, id))
}

async function defaultMarkFailed(id: string): Promise<void> {
  await db
    .update(pendingAliasResolution)
    .set({
      status: 'failed',
      lastRetryAt: new Date(),
      retryCount: sql`${pendingAliasResolution.retryCount} + 1`,
    })
    .where(eq(pendingAliasResolution.id, id))
}

async function defaultInsertPoint(row: PendingAliasRow, portalSub: string): Promise<void> {
  const p = row.rawPayload
  if (!isPointsPayload(p)) throw new Error('Not a points payload')

  const createdAt = parseTimestamp(p.timestamp)

  // Look up category by finding it via achievementPoints context.
  // Since we don't store categoryCode in the payload, we use BINTANG as default.
  // For a full solution this should store categoryCode in rawPayload — see Directive.
  const [cat] = await db
    .select({ id: pointCategories.id })
    .from(pointCategories)
    .where(eq(pointCategories.code, 'BINTANG'))
    .limit(1)

  if (!cat) throw new Error('Category BINTANG not found')

  await db.insert(achievementPoints).values({
    branchId: 'default', // branchId should be stored in rawPayload — see Directive
    userId: portalSub,
    categoryId: cat.id,
    points: p.points,
    reason: p.reason,
    screenshotUrl: p.screenshot,
    kittaComponent: null,
    status: 'active',
    submittedBy: portalSub,
    createdAt,
    updatedAt: new Date(),
  })
}

async function defaultInsertRedemption(row: PendingAliasRow, portalSub: string): Promise<void> {
  const p = row.rawPayload
  if (!isRedemptionPayload(p)) throw new Error('Not a redemption payload')

  const createdAt = parseTimestamp(p.timestamp)
  const parsedReward = parseReward(p.reward)

  // Find or create the reward
  const rewardKey = `${parsedReward.name}|${parsedReward.cost}`
  let [reward] = await db
    .select({ id: rewards.id })
    .from(rewards)
    .where(
      sql`${rewards.name} = ${parsedReward.name} AND ${rewards.pointCost} = ${parsedReward.cost}`,
    )
    .limit(1)

  if (!reward) {
    const [created] = await db
      .insert(rewards)
      .values({ name: parsedReward.name, pointCost: parsedReward.cost, isActive: true })
      .onConflictDoNothing()
      .returning({ id: rewards.id })
    if (!created) throw new Error(`Could not find or create reward: ${rewardKey}`)
    reward = created
  }

  await db.insert(redemptions).values({
    branchId: 'default', // branchId should be stored in rawPayload — see Directive
    userId: portalSub,
    rewardId: reward.id,
    pointsSpent: parsedReward.cost,
    notes: p.notes,
    status: 'approved',
    createdAt,
    updatedAt: new Date(),
  })
}

async function defaultUpsertProfile(row: PendingAliasRow, portalSub: string): Promise<void> {
  const p = row.rawPayload as Record<string, unknown>

  await db
    .insert(heroesProfiles)
    .values({
      id: portalSub,
      name: (p.name as string) ?? row.rawName,
      branchKey: 'default', // branchId should be stored in rawPayload — see Directive
      branchValueSnapshot: 'default',
      teamValueSnapshot: (p.teamName as string) ?? null,
      ...(p.attendanceName ? { attendanceName: p.attendanceName as string } : {}),
      ...(p.employmentStatus ? { employmentStatus: p.employmentStatus as string } : {}),
      ...(p.phone ? { phone: p.phone as string } : {}),
      ...(p.position ? { position: p.position as string } : {}),
      ...(p.talentaId ? { talentaId: p.talentaId as string } : {}),
    })
    .onConflictDoUpdate({
      target: heroesProfiles.id,
      set: {
        name: (p.name as string) ?? row.rawName,
        teamValueSnapshot: (p.teamName as string) ?? null,
        ...(p.attendanceName ? { attendanceName: p.attendanceName as string } : {}),
        ...(p.employmentStatus ? { employmentStatus: p.employmentStatus as string } : {}),
        ...(p.phone ? { phone: p.phone as string } : {}),
        ...(p.position ? { position: p.position as string } : {}),
        ...(p.talentaId ? { talentaId: p.talentaId as string } : {}),
      },
    })
}

async function defaultLookupCategory(code: string): Promise<{ id: string; code: string } | null> {
  const [cat] = await db
    .select({ id: pointCategories.id, code: pointCategories.code })
    .from(pointCategories)
    .where(eq(pointCategories.code, code))
    .limit(1)
  return cat ?? null
}

// ── drainPendingAliasQueueWithDeps (injectable — for tests) ─────────────────

export async function drainPendingAliasQueueWithDeps(
  rawNameNormalized: string,
  portalSub: string,
  deps: DrainDeps,
): Promise<{ replayed: number }> {
  const rows = await deps.fetchPending(rawNameNormalized)
  if (rows.length === 0) return { replayed: 0 }

  let replayed = 0

  for (const row of rows) {
    try {
      const p = row.rawPayload

      if (isRedemptionPayload(p)) {
        await deps.insertRedemption(row, portalSub)
      } else if (isPointsPayload(p)) {
        await deps.insertPoint(row, portalSub)
      } else {
        // Employee / profile row
        await deps.upsertProfile(row, portalSub)
      }

      await deps.markResolved(row.id)
      replayed++
    } catch {
      await deps.markFailed(row.id)
    }
  }

  return { replayed }
}

// ── drainPendingAliasQueue (public entry point) ──────────────────────────────

export async function drainPendingAliasQueue(
  rawNameNormalized: string,
  portalSub: string,
): Promise<{ replayed: number }> {
  return drainPendingAliasQueueWithDeps(rawNameNormalized, portalSub, {
    fetchPending: defaultFetchPending,
    markResolved: defaultMarkResolved,
    markFailed: defaultMarkFailed,
    insertPoint: (row, sub) => defaultInsertPoint(row, sub),
    insertRedemption: (row, sub) => defaultInsertRedemption(row, sub),
    upsertProfile: (row, sub) => defaultUpsertProfile(row, sub),
    lookupCategory: defaultLookupCategory,
  })
}
