import { eq, and, sql, inArray } from 'drizzle-orm'
import {
  heroesProfiles,
  achievementPoints,
  pointCategories,
  redemptions,
  rewards,
  pointSummaries,
  pendingAliasResolution,
  deactivatedUserIngestAudit,
} from '@coms/shared/db/schema'
import { db as defaultDb } from '@coms/shared/db'
import { readSheet } from './google-sheets'
import { createJob, updateJob } from '../repositories/sheet-sync'
import {
  KITTA_SHEET_MAP,
  EMPLOYEE_HEADERS,
  BINTANG_HEADERS,
  PENALTI_HEADERS,
  POIN_AHA_HEADERS,
  REDEEM_HEADERS,
} from '@coms/shared/constants'
import type { DbClient } from '../repositories/base'
import { getDb } from '../repositories/base'
import { buildHeaderIndex, parseReward, parseTimestamp } from './sheet-sync-helpers'
import { resolveAliasesBatch as defaultResolveAliasesBatch } from '../lib/portal-api-client'

/**
 * Render an unknown thrown value as a useful string for errorLog. Plain
 * objects (e.g. GaxiosError-shaped throws from google-auth-library) lose
 * everything under String(err) because their toString returns "[object
 * Object]"; JSON.stringify with non-enumerable property names keeps the
 * code/status/response detail that points at the real cause.
 */
function stringifyError(err: unknown): string {
  if (err instanceof Error) {
    const extras = JSON.stringify(err, Object.getOwnPropertyNames(err))
    return extras === '{}' ? err.message : `${err.message} | ${extras}`
  }
  if (err && typeof err === 'object') {
    try {
      return JSON.stringify(err, Object.getOwnPropertyNames(err))
    } catch {
      return String(err)
    }
  }
  return String(err)
}

// ── Public types ────────────────────────────────────────────────────────────

export type SyncResult = {
  processed: number
  failed: number
  errors: Array<{ tab: string; row: number; name: string; error: string }>
}

/** A row extracted from a sheet, ready for alias resolution. */
export type SheetRow = {
  rawName: string
  rawNameNormalized: string
  rowIdx: number
  rawPayload: Record<string, unknown>
}

/** One resolved+active alias. */
export type ActiveRow = {
  row: SheetRow
  portalSub: string
}

/** One resolved+tombstoned alias. */
export type TombstonedRow = {
  row: SheetRow
  portalSub: string
}

/** One row whose alias could not be resolved. */
export type UnresolvedRow = {
  row: SheetRow
  rawNameNormalized: string
}

/** Result bucket returned by resolveAndRouteRows. */
export type RoutedRows = {
  active: ActiveRow[]
  tombstoned: TombstonedRow[]
  unresolved: UnresolvedRow[]
}

/** A sheet row parsed into achievement-point fields, before alias resolution. */
export type ParsedPoint = {
  sheetRow: SheetRow
  reason: string
  screenshotUrl: string | null
  points: number
  kittaComponent: string | null
  createdAt: Date
}

/** Shape passed to db.insert(achievementPoints).values(...). */
export type PointInsertRow = {
  branchKey: string
  userId: string
  categoryId: string
  points: number
  reason: string
  screenshotUrl: string | null
  kittaComponent: 'K' | 'I' | 'T1' | 'T2' | 'A' | null
  status: 'active'
  submittedBy: string
  createdAt: Date
  updatedAt: Date
}

/** Dependency injection seam for tests. */
export type ResolveAndRouteDeps = {
  resolver?: (input: { names: string[] }) => Promise<{
    resolved: Array<{
      rawNameNormalized: string
      aliasId: string
      portalSub: string
      isPrimary: boolean
      tombstoned: boolean
      deactivatedAt: string | null
    }>
    unresolved: string[]
  }>
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const BATCH_SIZE = 100
const ALIAS_BATCH_SIZE = 1000

function formatCreatedSecond(d: Date): string {
  return (
    `${d.getUTCFullYear()}-` +
    `${String(d.getUTCMonth() + 1).padStart(2, '0')}-` +
    `${String(d.getUTCDate()).padStart(2, '0')} ` +
    `${String(d.getUTCHours()).padStart(2, '0')}:` +
    `${String(d.getUTCMinutes()).padStart(2, '0')}:` +
    `${String(d.getUTCSeconds()).padStart(2, '0')}`
  )
}

/**
 * Build the achievement_points insert payload for active rows. Pure function:
 * no DB, no I/O. Extracted so the dedup-by-rowIdx contract is unit-testable.
 *
 * Two sheet rows that share a name (e.g. one person with multiple Penalti
 * entries) MUST land as two distinct inserts. Indexing by `rowIdx` instead of
 * `rawNameNormalized` is what guarantees that — keying by name collapses
 * `parsedRows` to a single survivor and replicates it across every active
 * entry.
 */
export function buildPointsToInsert(args: {
  parsedRows: ParsedPoint[]
  routedActive: ActiveRow[]
  dbCounts: Map<string, number>
  branchKey: string
  categoryId: string
  categoryCode: string
  adminProfileId: string | undefined
  now: Date
}): { toInsert: PointInsertRow[]; processed: number } {
  const parsedByIdx = new Map(args.parsedRows.map((p) => [p.sheetRow.rowIdx, p]))
  const sheetCounts = new Map<string, number>()
  const toInsert: PointInsertRow[] = []
  let processed = 0

  for (const activeRow of args.routedActive) {
    const meta = parsedByIdx.get(activeRow.row.rowIdx)
    if (!meta) continue

    const createdSecond = formatCreatedSecond(meta.createdAt)
    const dedupKey = `${activeRow.portalSub}|${meta.reason}|${meta.points}|${createdSecond}`

    const seenInSheet = (sheetCounts.get(dedupKey) ?? 0) + 1
    sheetCounts.set(dedupKey, seenInSheet)

    if (seenInSheet <= (args.dbCounts.get(dedupKey) ?? 0)) {
      processed++
      continue
    }

    const submittedBy =
      args.categoryCode === 'BINTANG'
        ? activeRow.portalSub
        : (args.adminProfileId ?? activeRow.portalSub)

    toInsert.push({
      branchKey: args.branchKey,
      userId: activeRow.portalSub,
      categoryId: args.categoryId,
      points: meta.points,
      reason: meta.reason,
      screenshotUrl: meta.screenshotUrl,
      kittaComponent: meta.kittaComponent as 'K' | 'I' | 'T1' | 'T2' | 'A' | null,
      status: 'active',
      submittedBy,
      createdAt: meta.createdAt,
      updatedAt: args.now,
    })

    processed++
  }

  return { toInsert, processed }
}

type TabNames = {
  employees: string
  bintang: string
  penalti: string
  poinAha: string
  redeem: string
}

// ── resolveAndRouteRows ─────────────────────────────────────────────────────
//
// Core portal-identity consumer. Extracts unique normalised names from rows,
// calls resolveAliasesBatch (chunked into 1000-name batches in parallel),
// then splits into 4 buckets per the contract:
//   1. active   — resolved + !tombstoned
//   2. tombstoned — resolved + tombstoned
//   3. unresolved — not found in portal
//   4. batch failure — throws to caller
//
export async function resolveAndRouteRows(
  rows: SheetRow[],
  _sheetId: string,
  _tabName: string,
  deps: ResolveAndRouteDeps = {},
): Promise<RoutedRows> {
  const resolver = deps.resolver ?? defaultResolveAliasesBatch

  // Unique normalised names across all rows
  const uniqueNames = [...new Set(rows.map((r) => r.rawNameNormalized))]

  // Chunk into ≤1000 batches, call in parallel (batch failure → throw)
  const chunks: string[][] = []
  for (let i = 0; i < uniqueNames.length; i += ALIAS_BATCH_SIZE) {
    chunks.push(uniqueNames.slice(i, i + ALIAS_BATCH_SIZE))
  }

  const chunkResults = await Promise.all(chunks.map((batch) => resolver({ names: batch })))

  // Merge chunk results into lookup maps
  const resolvedMap = new Map<
    string,
    { portalSub: string; tombstoned: boolean }
  >()
  const unresolvedSet = new Set<string>()

  for (const res of chunkResults) {
    for (const r of res.resolved) {
      resolvedMap.set(r.rawNameNormalized, {
        portalSub: r.portalSub,
        tombstoned: r.tombstoned,
      })
    }
    for (const u of res.unresolved) {
      unresolvedSet.add(u)
    }
  }

  // Route rows into buckets
  const active: ActiveRow[] = []
  const tombstoned: TombstonedRow[] = []
  const unresolved: UnresolvedRow[] = []

  for (const row of rows) {
    const resolution = resolvedMap.get(row.rawNameNormalized)
    if (resolution) {
      if (resolution.tombstoned) {
        tombstoned.push({ row, portalSub: resolution.portalSub })
      } else {
        active.push({ row, portalSub: resolution.portalSub })
      }
    } else {
      unresolved.push({ row, rawNameNormalized: row.rawNameNormalized })
    }
  }

  return { active, tombstoned, unresolved }
}

// ── writePendingRows ────────────────────────────────────────────────────────
//
// Persists unresolved rows to pending_alias_resolution.
// Called by each sync path for outcome 3.
//
async function writePendingRows(
  unresolvedRows: UnresolvedRow[],
  sheetId: string,
  db: ReturnType<typeof getDb>,
): Promise<void> {
  if (unresolvedRows.length === 0) return

  const values = unresolvedRows.map((u) => ({
    sheetId,
    sheetRowNumber: u.row.rowIdx + 2, // 1-indexed + header row
    rawName: u.row.rawName,
    rawNameNormalized: u.row.rawNameNormalized,
    rawPayload: u.row.rawPayload,
    status: 'pending' as const,
  }))

  for (let i = 0; i < values.length; i += BATCH_SIZE) {
    await db
      .insert(pendingAliasResolution)
      .values(values.slice(i, i + BATCH_SIZE))
      .onConflictDoNothing()
  }
}

// ── writeTombstonedRows ─────────────────────────────────────────────────────
//
// Persists tombstoned rows to deactivated_user_ingest_audit.
// Called by each sync path for outcome 2.
//
async function writeTombstonedRows(
  tombstonedRows: TombstonedRow[],
  sheetId: string,
  db: ReturnType<typeof getDb>,
): Promise<void> {
  if (tombstonedRows.length === 0) return

  const values = tombstonedRows.map((t) => ({
    sheetId,
    sheetRowNumber: t.row.rowIdx + 2,
    portalSub: t.portalSub,
    rawPayload: t.row.rawPayload,
  }))

  for (let i = 0; i < values.length; i += BATCH_SIZE) {
    await db.insert(deactivatedUserIngestAudit).values(values.slice(i, i + BATCH_SIZE))
  }
}

// ── syncEmployees ───────────────────────────────────────────────────────────
//
// Employees tab: identity is portal-owned. Sheet provides metadata only.
// Active rows → upsert heroes_profiles row keyed on portalSub.
// Tombstoned → deactivated_user_ingest_audit.
// Unresolved → pending_alias_resolution.
//

export async function syncEmployees(
  sheetId: string,
  tabName: string,
  branchKey: string,
  tx?: DbClient,
  deps: ResolveAndRouteDeps = {},
): Promise<SyncResult> {
  const db = getDb(tx)
  const rows = await readSheet(sheetId, tabName)
  if (rows.length < 2) return { processed: 0, failed: 0, errors: [] }

  const headerIndex = buildHeaderIndex(rows[0], EMPLOYEE_HEADERS)
  const dataRows = rows.slice(1)

  let processed = 0
  let failed = 0
  const errors: SyncResult['errors'] = []

  // 1. Parse sheet rows into SheetRow + metadata
  // Teams are stored as value snapshots on heroesProfiles — no FK table.
  type ParsedEmployee = {
    sheetRow: SheetRow
    attendanceName?: string
    phone?: string
    teamName?: string
    position?: string
    employmentStatus?: string
    talentaId?: string
  }
  const parsed: ParsedEmployee[] = []

  for (const [i, row] of dataRows.entries()) {
    const name = row[headerIndex.NAME]?.trim()
    const attendanceName = row[headerIndex.ATTENDANCE_NAME]?.trim()
    const phone = row[headerIndex.PHONE]?.trim()
    const teamName = row[headerIndex.TEAM]?.trim()
    const position = row[headerIndex.POSITION]?.trim()
    const employmentStatus = row[headerIndex.STATUS]?.trim()
    const talentaId = row[headerIndex.TALENTA_ID]?.trim()

    // Trailing blank rows from the sheet are not data — skip silently.
    if (row.every((cell) => !cell?.trim())) continue

    if (!name) {
      failed++
      errors.push({ tab: tabName, row: i + 2, name: '', error: 'Missing name' })
      continue
    }

    const rawPayload: Record<string, unknown> = { name }
    if (attendanceName) rawPayload.attendanceName = attendanceName
    if (phone) rawPayload.phone = phone
    if (teamName) rawPayload.teamName = teamName
    if (position) rawPayload.position = position
    if (employmentStatus) rawPayload.employmentStatus = employmentStatus
    if (talentaId) rawPayload.talentaId = talentaId

    parsed.push({
      sheetRow: {
        rawName: name,
        rawNameNormalized: name.toLowerCase().trim(),
        rowIdx: i,
        rawPayload,
      },
      attendanceName,
      phone,
      teamName,
      position,
      employmentStatus,
      talentaId,
    })
  }

  // 2. Resolve all names via portal alias system
  let routed: RoutedRows
  try {
    routed = await resolveAndRouteRows(
      parsed.map((p) => p.sheetRow),
      sheetId,
      tabName,
      deps,
    )
  } catch (err) {
    errors.push({
      tab: tabName,
      row: 0,
      name: '',
      error: `resolveAliasesBatch failed: ${stringifyError(err)}`,
    })
    return { processed, failed: failed + parsed.length, errors }
  }

  // 3. Outcome 3 — write unresolved to pending queue
  await writePendingRows(routed.unresolved, sheetId, db)
  failed += routed.unresolved.length

  // 4. Outcome 2 — write tombstoned to audit table
  await writeTombstonedRows(routed.tombstoned, sheetId, db)
  // tombstoned counts as "processed" (we handled it correctly)
  processed += routed.tombstoned.length

  // 5. Outcome 1 — upsert active heroes_profiles rows
  // Build quick lookup: normalised name → parsed metadata
  const parsedByNorm = new Map(parsed.map((p) => [p.sheetRow.rawNameNormalized, p]))

  for (const activeRow of routed.active) {
    const meta = parsedByNorm.get(activeRow.row.rawNameNormalized)
    if (!meta) continue

    try {
      await db
        .insert(heroesProfiles)
        .values({
          id: activeRow.portalSub,
          branchKey: branchKey,
          branchValueSnapshot: branchKey,
          name: activeRow.row.rawName,
          ...(meta.attendanceName ? { attendanceName: meta.attendanceName } : {}),
          ...(meta.employmentStatus ? { employmentStatus: meta.employmentStatus } : {}),
          ...(meta.phone ? { phone: meta.phone } : {}),
          ...(meta.position ? { position: meta.position } : {}),
          ...(meta.talentaId ? { talentaId: meta.talentaId } : {}),
          teamValueSnapshot: meta.teamName ?? null,
        })
        .onConflictDoUpdate({
          target: heroesProfiles.id,
          set: {
            name: activeRow.row.rawName,
            ...(meta.attendanceName ? { attendanceName: meta.attendanceName } : {}),
            ...(meta.employmentStatus ? { employmentStatus: meta.employmentStatus } : {}),
            ...(meta.phone ? { phone: meta.phone } : {}),
            ...(meta.position ? { position: meta.position } : {}),
            ...(meta.talentaId ? { talentaId: meta.talentaId } : {}),
            teamValueSnapshot: meta.teamName ?? null,
          },
        })

      processed++
    } catch (err) {
      failed++
      errors.push({
        tab: tabName,
        row: activeRow.row.rowIdx + 2,
        name: activeRow.row.rawName,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return { processed, failed, errors }
}

// ── syncPoints ──────────────────────────────────────────────────────────────

export async function syncPoints(
  sheetId: string,
  tabName: string,
  categoryCode: string,
  branchKey: string,
  tx?: DbClient,
  deps: ResolveAndRouteDeps = {},
): Promise<SyncResult> {
  const db = getDb(tx)
  const rows = await readSheet(sheetId, tabName)
  if (rows.length < 2) return { processed: 0, failed: 0, errors: [] }

  const [cat] = await db
    .select({ id: pointCategories.id })
    .from(pointCategories)
    .where(eq(pointCategories.code, categoryCode))
    .limit(1)

  if (!cat) {
    return {
      processed: 0,
      failed: 0,
      errors: [{ tab: tabName, row: 0, name: '', error: `Category not found: ${categoryCode}` }],
    }
  }

  const headerMapByCode: Record<string, Record<string, string>> = {
    BINTANG: BINTANG_HEADERS,
    PENALTI: PENALTI_HEADERS,
    POIN_AHA: POIN_AHA_HEADERS,
  }

  const headerMap = headerMapByCode[categoryCode] ?? BINTANG_HEADERS
  const headerIndex = buildHeaderIndex(rows[0], headerMap)
  const dataRows = rows.slice(1)

  let processed = 0
  let failed = 0
  const errors: SyncResult['errors'] = []

  // 1. Parse all rows first, collect names that need resolution
  const parsedRows: ParsedPoint[] = []

  for (const [i, row] of dataRows.entries()) {
    const timestampRaw = row[headerIndex.TIMESTAMP]?.trim()
    const nameRaw = row[headerIndex.NAME]?.trim()
    const reasonRaw = row[headerIndex.REASON]?.trim()
    const screenshotRaw = row[headerIndex.SCREENSHOT]?.trim()

    // Trailing blank rows from the sheet are not data — skip silently.
    if (row.every((cell) => !cell?.trim())) continue

    if (!timestampRaw || !nameRaw) {
      failed++
      errors.push({
        tab: tabName,
        row: i + 2,
        name: nameRaw ?? '',
        error: 'Missing timestamp or name',
      })
      continue
    }

    let createdAt: Date
    try {
      createdAt = parseTimestamp(timestampRaw)
    } catch (err) {
      failed++
      errors.push({
        tab: tabName,
        row: i + 2,
        name: nameRaw,
        error: err instanceof Error ? err.message : String(err),
      })
      continue
    }

    let points = 1
    let kittaComponent: string | null = null

    if (categoryCode === 'PENALTI') {
      const pointsRaw = row[headerIndex.POINTS]?.trim()
      const kittaRaw = row[headerIndex.KITTA]?.trim()
      points = pointsRaw ? Number(pointsRaw) : 1
      if (isNaN(points) || points <= 0) points = 1
      kittaComponent = kittaRaw ? (KITTA_SHEET_MAP[kittaRaw] ?? null) : null
    } else if (categoryCode === 'POIN_AHA') {
      const pointsRaw = row[headerIndex.POINTS]?.trim()
      points = pointsRaw ? Number(pointsRaw) : 1
      if (isNaN(points) || points <= 0) points = 1
    }

    const rawPayload: Record<string, unknown> = {
      name: nameRaw,
      timestamp: timestampRaw,
      reason: reasonRaw ?? '',
      screenshot: screenshotRaw ?? null,
      points,
    }

    parsedRows.push({
      sheetRow: {
        rawName: nameRaw,
        rawNameNormalized: nameRaw.toLowerCase().trim(),
        rowIdx: i,
        rawPayload,
      },
      reason: reasonRaw ?? '',
      screenshotUrl: screenshotRaw || null,
      points,
      kittaComponent,
      createdAt,
    })
  }

  // 2. Resolve all names via portal alias system
  let routed: RoutedRows
  try {
    routed = await resolveAndRouteRows(
      parsedRows.map((p) => p.sheetRow),
      sheetId,
      tabName,
      deps,
    )
  } catch (err) {
    errors.push({
      tab: tabName,
      row: 0,
      name: '',
      error: `resolveAliasesBatch failed: ${stringifyError(err)}`,
    })
    return { processed, failed: failed + parsedRows.length, errors }
  }

  // 3. Outcome 3 — write unresolved to pending queue
  await writePendingRows(routed.unresolved, sheetId, db)
  failed += routed.unresolved.length

  // 4. Outcome 2 — write tombstoned to audit table
  await writeTombstonedRows(routed.tombstoned, sheetId, db)
  processed += routed.tombstoned.length

  // 5. Outcome 1 — insert achievement_points for active rows.
  // Find system admin user for submittedBy fallback (single query)
  const [adminProfile] = await db
    .select({ id: heroesProfiles.id })
    .from(heroesProfiles)
    .where(eq(heroesProfiles.branchKey, branchKey))
    .limit(1)

  // Pre-load existing points for dedup (single query)
  const existingPoints = await db
    .select({
      userId: achievementPoints.userId,
      reason: achievementPoints.reason,
      points: achievementPoints.points,
      createdSecond: sql<string>`to_char(${achievementPoints.createdAt}, 'YYYY-MM-DD HH24:MI:SS')`,
    })
    .from(achievementPoints)
    .where(and(eq(achievementPoints.branchKey, branchKey), eq(achievementPoints.categoryId, cat.id)))

  const dbCounts = new Map<string, number>()
  for (const p of existingPoints) {
    const key = `${p.userId}|${p.reason}|${p.points}|${p.createdSecond}`
    dbCounts.set(key, (dbCounts.get(key) ?? 0) + 1)
  }

  const built = buildPointsToInsert({
    parsedRows,
    routedActive: routed.active,
    dbCounts,
    branchKey,
    categoryId: cat.id,
    categoryCode,
    adminProfileId: adminProfile?.id,
    now: new Date(),
  })
  const toInsert = built.toInsert
  processed += built.processed

  // Batch insert
  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    try {
      await db.insert(achievementPoints).values(toInsert.slice(i, i + BATCH_SIZE))
    } catch {
      for (const row of toInsert.slice(i, i + BATCH_SIZE)) {
        try {
          await db.insert(achievementPoints).values(row)
        } catch (innerErr) {
          processed--
          failed++
          errors.push({
            tab: tabName,
            row: 0,
            name: '',
            error: innerErr instanceof Error ? innerErr.message : String(innerErr),
          })
        }
      }
    }
  }

  return { processed, failed, errors }
}

// ── syncRedemptions ─────────────────────────────────────────────────────────

export async function syncRedemptions(
  sheetId: string,
  tabName: string,
  branchKey: string,
  tx?: DbClient,
  deps: ResolveAndRouteDeps = {},
): Promise<SyncResult> {
  const db = getDb(tx)
  const rows = await readSheet(sheetId, tabName)
  if (rows.length < 2) return { processed: 0, failed: 0, errors: [] }

  const headerIndex = buildHeaderIndex(rows[0], REDEEM_HEADERS)
  const dataRows = rows.slice(1)

  let processed = 0
  let failed = 0
  const errors: SyncResult['errors'] = []

  // 1. Pre-load all rewards (single query)
  const existingRewards = await db
    .select({ id: rewards.id, name: rewards.name, pointCost: rewards.pointCost })
    .from(rewards)
  const rewardMap = new Map(existingRewards.map((r) => [`${r.name}|${r.pointCost}`, r.id]))

  // 2. Pre-load existing redemptions for dedup (single query)
  const existingRedemptionRows = await db
    .select({
      userId: redemptions.userId,
      rewardId: redemptions.rewardId,
      createdSecond: sql<string>`to_char(${redemptions.createdAt}, 'YYYY-MM-DD HH24:MI:SS')`,
    })
    .from(redemptions)
    .where(eq(redemptions.branchKey, branchKey))

  const redemptionDedupSet = new Set(
    existingRedemptionRows.map((r) => `${r.userId}|${r.rewardId}|${r.createdSecond}`),
  )

  // 3. Parse rows
  type ParsedRedemption = {
    sheetRow: SheetRow
    createdAt: Date
    reward: { name: string; cost: number }
    notes: string | null
  }
  const parsedRows: ParsedRedemption[] = []

  for (const [i, row] of dataRows.entries()) {
    const timestampRaw = row[headerIndex.TIMESTAMP]?.trim()
    const nameRaw = row[headerIndex.NAME]?.trim()
    const rewardRaw = row[headerIndex.REWARD]?.trim()
    const notesRaw = row[headerIndex.NOTES]?.trim()

    // Trailing blank rows from the sheet are not data — skip silently.
    if (row.every((cell) => !cell?.trim())) continue

    if (!timestampRaw || !nameRaw || !rewardRaw) {
      failed++
      errors.push({
        tab: tabName,
        row: i + 2,
        name: nameRaw ?? '',
        error: 'Missing required fields',
      })
      continue
    }

    let createdAt: Date
    try {
      createdAt = parseTimestamp(timestampRaw)
    } catch (err) {
      failed++
      errors.push({
        tab: tabName,
        row: i + 2,
        name: nameRaw,
        error: err instanceof Error ? err.message : String(err),
      })
      continue
    }

    let parsedReward: { name: string; cost: number }
    try {
      parsedReward = parseReward(rewardRaw)
    } catch (err) {
      failed++
      errors.push({
        tab: tabName,
        row: i + 2,
        name: nameRaw,
        error: err instanceof Error ? err.message : String(err),
      })
      continue
    }

    const rawPayload: Record<string, unknown> = {
      name: nameRaw,
      timestamp: timestampRaw,
      reward: rewardRaw,
      notes: notesRaw ?? null,
    }

    parsedRows.push({
      sheetRow: {
        rawName: nameRaw,
        rawNameNormalized: nameRaw.toLowerCase().trim(),
        rowIdx: i,
        rawPayload,
      },
      createdAt,
      reward: parsedReward,
      notes: notesRaw || null,
    })
  }

  // 4. Resolve all names via portal alias system
  let routed: RoutedRows
  try {
    routed = await resolveAndRouteRows(
      parsedRows.map((p) => p.sheetRow),
      sheetId,
      tabName,
      deps,
    )
  } catch (err) {
    errors.push({
      tab: tabName,
      row: 0,
      name: '',
      error: `resolveAliasesBatch failed: ${stringifyError(err)}`,
    })
    return { processed, failed: failed + parsedRows.length, errors }
  }

  // 5. Outcome 3 — write unresolved to pending queue
  await writePendingRows(routed.unresolved, sheetId, db)
  failed += routed.unresolved.length

  // 6. Outcome 2 — write tombstoned to audit table
  await writeTombstonedRows(routed.tombstoned, sheetId, db)
  processed += routed.tombstoned.length

  // 7. Collect and batch-create missing rewards
  // Index by sheet row index, not name — multiple sheet rows can share a name
  // (e.g. one person redeeming several rewards). Keying by name would collapse
  // them and replicate the survivor across every active entry.
  const parsedByIdx = new Map(parsedRows.map((p) => [p.sheetRow.rowIdx, p]))

  const missingRewardKeys = new Set<string>()
  for (const activeRow of routed.active) {
    const meta = parsedByIdx.get(activeRow.row.rowIdx)
    if (!meta) continue
    const key = `${meta.reward.name}|${meta.reward.cost}`
    if (!rewardMap.has(key)) missingRewardKeys.add(key)
  }

  if (missingRewardKeys.size > 0) {
    const newRewards = [...missingRewardKeys].map((key) => {
      const [name, cost] = key.split('|')
      return { name, pointCost: Number(cost), branchKey, isActive: true }
    })

    const created = await db
      .insert(rewards)
      .values(newRewards)
      .onConflictDoNothing()
      .returning({ id: rewards.id, name: rewards.name, pointCost: rewards.pointCost })

    for (const r of created) {
      rewardMap.set(`${r.name}|${r.pointCost}`, r.id)
    }

    if (created.length < newRewards.length) {
      const refetch = await db
        .select({ id: rewards.id, name: rewards.name, pointCost: rewards.pointCost })
        .from(rewards)
      for (const r of refetch) {
        rewardMap.set(`${r.name}|${r.pointCost}`, r.id)
      }
    }
  }

  // 8. Outcome 1 — insert redemptions for active rows
  const toInsert: Array<{
    branchKey: string
    userId: string
    rewardId: string
    pointsSpent: number
    notes: string | null
    status: 'approved'
    createdAt: Date
    updatedAt: Date
  }> = []

  for (const activeRow of routed.active) {
    const meta = parsedByIdx.get(activeRow.row.rowIdx)
    if (!meta) continue

    const rewardKey = `${meta.reward.name}|${meta.reward.cost}`
    const rewardId = rewardMap.get(rewardKey)
    if (!rewardId) {
      failed++
      errors.push({
        tab: tabName,
        row: activeRow.row.rowIdx + 2,
        name: activeRow.row.rawName,
        error: `Reward not found: ${meta.reward.name}`,
      })
      continue
    }

    const createdSecond = `${meta.createdAt.getUTCFullYear()}-${String(meta.createdAt.getUTCMonth() + 1).padStart(2, '0')}-${String(meta.createdAt.getUTCDate()).padStart(2, '0')} ${String(meta.createdAt.getUTCHours()).padStart(2, '0')}:${String(meta.createdAt.getUTCMinutes()).padStart(2, '0')}:${String(meta.createdAt.getUTCSeconds()).padStart(2, '0')}`
    const dedupKey = `${activeRow.portalSub}|${rewardId}|${createdSecond}`

    if (redemptionDedupSet.has(dedupKey)) {
      processed++
      continue
    }

    toInsert.push({
      branchKey,
      userId: activeRow.portalSub,
      rewardId,
      pointsSpent: meta.reward.cost,
      notes: meta.notes,
      status: 'approved',
      createdAt: meta.createdAt,
      updatedAt: new Date(),
    })

    redemptionDedupSet.add(dedupKey)
    processed++
  }

  // Batch insert
  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    try {
      await db.insert(redemptions).values(toInsert.slice(i, i + BATCH_SIZE))
    } catch {
      for (const row of toInsert.slice(i, i + BATCH_SIZE)) {
        try {
          await db.insert(redemptions).values(row)
        } catch (innerErr) {
          processed--
          failed++
          errors.push({
            tab: tabName,
            row: 0,
            name: '',
            error: innerErr instanceof Error ? innerErr.message : String(innerErr),
          })
        }
      }
    }
  }

  return { processed, failed, errors }
}

// ── recalculatePointSummaries ───────────────────────────────────────────────

export async function recalculatePointSummaries(branchKey: string, tx?: DbClient): Promise<void> {
  const db = getDb(tx)

  // Single SQL: compute all summaries and upsert in one shot
  // Uses heroesProfiles (not users) as the identity source.
  await db.execute(sql`
    INSERT INTO point_summaries (id, user_id, branch_key, bintang_count, penalti_points_sum, direct_poin_aha, redeemed_total, updated_at)
    SELECT
      gen_random_uuid(),
      hp.id,
      hp.branch_key,
      COALESCE(SUM(CASE WHEN pc.code = 'BINTANG' AND ap.status = 'active' THEN 1 ELSE 0 END), 0)::int,
      COALESCE(SUM(CASE WHEN pc.code = 'PENALTI' AND ap.status = 'active' THEN ap.points ELSE 0 END), 0)::int,
      COALESCE(SUM(CASE WHEN pc.code = 'POIN_AHA' AND ap.status = 'active' THEN ap.points ELSE 0 END), 0)::int,
      COALESCE(rd.redeemed, 0)::int,
      NOW()
    FROM heroes_profiles hp
    LEFT JOIN achievement_points ap ON ap.user_id = hp.id
    LEFT JOIN point_categories pc ON pc.id = ap.category_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(r.points_spent), 0)::int AS redeemed
      FROM redemptions r
      WHERE r.user_id = hp.id AND r.status = 'approved'
    ) rd ON TRUE
    WHERE hp.branch_key = ${branchKey}
    GROUP BY hp.id, hp.branch_key, rd.redeemed
    ON CONFLICT (user_id) DO UPDATE SET
      bintang_count = EXCLUDED.bintang_count,
      penalti_points_sum = EXCLUDED.penalti_points_sum,
      direct_poin_aha = EXCLUDED.direct_poin_aha,
      redeemed_total = EXCLUDED.redeemed_total,
      updated_at = NOW()
  `)
}

// ── runFullSync ─────────────────────────────────────────────────────────────

export async function runFullSync(
  sheetIds: { points: string; employees: string },
  tabNames: TabNames,
  branchKey: string,
  startedBy?: string,
  tx?: DbClient,
  direction: 'import' | 'resync' = 'import',
) {
  const db = (tx ?? defaultDb) as unknown as DbClient
  // Audit operations always run on defaultDb so the job record persists even
  // when the work transaction (during a resync) rolls back. Without this, a
  // failed resync would leave no trace in sheet_sync_jobs for operators.
  const auditDb = defaultDb as unknown as DbClient

  const job = await createJob(
    {
      branchKey,
      direction,
      sheetId: `${sheetIds.employees},${sheetIds.points}`,
      sheetName: Object.values(tabNames).join(', '),
      status: 'in_progress',
      startedBy: startedBy ?? null,
      startedAt: new Date(),
      rowsProcessed: 0,
      rowsFailed: 0,
    },
    auditDb,
  )

  let totalProcessed = 0
  let totalFailed = 0
  const allErrors: SyncResult['errors'] = []
  // Catastrophic step failures (a whole syncEmployees/syncPoints/etc. throw,
  // not per-row failures). Surfaced after the fact so that, when this run is
  // inside a transaction (resync), the caller can rollback by re-throwing.
  const stepFailures: unknown[] = []

  const runStep = async (fn: () => Promise<SyncResult>) => {
    try {
      const result = await fn()
      totalProcessed += result.processed
      totalFailed += result.failed
      allErrors.push(...result.errors)
    } catch (err) {
      console.error('[sheet-sync] step failed', err)
      totalFailed++
      stepFailures.push(err)
      allErrors.push({
        tab: 'unknown',
        row: 0,
        name: '',
        error: stringifyError(err),
      })
    }
  }

  await runStep(() => syncEmployees(sheetIds.employees, tabNames.employees, branchKey, db))
  await runStep(() => syncPoints(sheetIds.points, tabNames.bintang, 'BINTANG', branchKey, db))
  await runStep(() => syncPoints(sheetIds.points, tabNames.penalti, 'PENALTI', branchKey, db))
  await runStep(() => syncPoints(sheetIds.points, tabNames.poinAha, 'POIN_AHA', branchKey, db))
  await runStep(() => syncRedemptions(sheetIds.points, tabNames.redeem, branchKey, db))

  try {
    await recalculatePointSummaries(branchKey, db)
  } catch (err) {
    allErrors.push({
      tab: 'point_summaries',
      row: 0,
      name: '',
      error: err instanceof Error ? err.message : String(err),
    })
  }

  await updateJob(
    job.id,
    {
      status: totalFailed > 0 && totalProcessed === 0 ? 'failed' : 'completed',
      rowsProcessed: totalProcessed,
      rowsFailed: totalFailed,
      errorLog: allErrors.length > 0 ? allErrors : null,
      completedAt: new Date(),
    },
    auditDb,
  )

  // When invoked inside a transaction (i.e. from runFullResync), any
  // catastrophic step failure must propagate so the surrounding tx rolls back
  // — otherwise the wipe would commit with partially-imported data. For
  // incremental sync (no tx), we swallow as before so partial progress sticks.
  if (tx && stepFailures.length > 0) {
    throw stepFailures[0]
  }

  return {
    jobId: job.id,
    processed: totalProcessed,
    failed: totalFailed,
    errors: allErrors,
  }
}

/**
 * Wipe all transactional data for the branch, then re-import from the sheet.
 *
 * The wipe and the import run inside one DB transaction so the operation is
 * idempotent: if any step throws, Postgres rolls back the wipe and the table
 * is left exactly as it was before the click. Safe to invoke at any time.
 *
 * The audit job record (`sheet_sync_jobs`) is intentionally written via
 * `defaultDb` inside `runFullSync`, *not* the tx — that way a failed resync
 * still leaves a row behind for operators to inspect.
 */
export async function runFullResync(
  sheetIds: { points: string; employees: string },
  tabNames: TabNames,
  branchKey: string,
  startedBy?: string,
  db: DbClient = defaultDb as unknown as DbClient,
) {
  return db.transaction(async (tx) => {
    await tx.delete(redemptions).where(eq(redemptions.branchKey, branchKey))
    await tx.delete(achievementPoints).where(eq(achievementPoints.branchKey, branchKey))
    await tx.delete(pointSummaries).where(eq(pointSummaries.branchKey, branchKey))

    return runFullSync(sheetIds, tabNames, branchKey, startedBy, tx, 'resync')
  })
}
