import { eq, and, lt, sql } from 'drizzle-orm'
import { db } from '@coms/shared/db'
import { taxonomyCache, sheetSyncJobs } from '@coms/shared/db/schema'
import { runFullSync, runFullResync } from './sheet-sync'

type SyncConfig = {
  sheetIds: {
    points: string
    employees: string
  }
  tabNames: {
    employees: string
    bintang: string
    penalti: string
    poinAha: string
    redeem: string
  }
  branchKey: string
}

let isSyncing = false

const STALE_JOB_MINUTES = 30

/** Mark any in_progress jobs older than 30 minutes as failed (crashed/timed out). */
export async function cleanupStaleJobs(): Promise<void> {
  await db
    .update(sheetSyncJobs)
    .set({
      status: 'failed',
      completedAt: new Date(),
      errorLog: [
        { tab: 'system', row: 0, name: '', error: 'Job timed out — marked as failed by cleanup' },
      ],
    })
    .where(
      and(
        eq(sheetSyncJobs.status, 'in_progress'),
        lt(
          sheetSyncJobs.startedAt,
          sql`NOW() - INTERVAL '${sql.raw(String(STALE_JOB_MINUTES))} minutes'`,
        ),
      ),
    )
}

async function getDefaultBranchKey(): Promise<string | null> {
  const [entry] = await db
    .select({ key: taxonomyCache.key })
    .from(taxonomyCache)
    .where(eq(taxonomyCache.taxonomyId, 'branches'))
    .limit(1)
  return entry?.key ?? null
}

function buildConfigFromEnv(): Omit<SyncConfig, 'branchKey'> {
  return {
    sheetIds: {
      points: process.env.GOOGLE_SHEET_ID_POINTS ?? '',
      employees: process.env.GOOGLE_SHEET_ID_EMPLOYEES ?? '',
    },
    tabNames: {
      employees: process.env.SHEET_TAB_EMPLOYEES ?? 'HEROES - Fulltime Staff',
      bintang: process.env.SHEET_TAB_BINTANG ?? 'Poin Bintang',
      penalti: process.env.SHEET_TAB_PENALTI ?? 'Poin Penalti',
      poinAha: process.env.SHEET_TAB_POIN_AHA ?? 'Poin AHA',
      redeem: process.env.SHEET_TAB_REDEEM ?? 'Redeem Poin AHA',
    },
  }
}

export async function isSyncRunning(): Promise<boolean> {
  if (isSyncing) return true

  // Also check the database for in_progress jobs that might be running
  // from a previous server instance (e.g. after restart/deploy)
  const [activeJob] = await db
    .select({ id: sheetSyncJobs.id })
    .from(sheetSyncJobs)
    .where(eq(sheetSyncJobs.status, 'in_progress'))
    .limit(1)

  return !!activeJob
}

export async function triggerManualSync(startedBy?: string) {
  if (isSyncing) return null
  isSyncing = true
  try {
    await cleanupStaleJobs()
    const config = buildConfigFromEnv()
    const branchKey = await getDefaultBranchKey()
    if (!branchKey) throw new Error('No branch found')
    if (!config.sheetIds.points && !config.sheetIds.employees) {
      throw new Error('GOOGLE_SHEET_ID_POINTS/EMPLOYEES env vars not set')
    }
    return await runFullSync(config.sheetIds, config.tabNames, branchKey, startedBy)
  } catch (err) {
    console.error('[sheet-sync] sync error:', err)
    throw err
  } finally {
    isSyncing = false
  }
}

export function triggerSyncInBackground(startedBy?: string) {
  if (isSyncing) return { started: false, reason: 'Sync already in progress' }
  void triggerManualSync(startedBy).catch(() => {})
  return { started: true }
}

/** Wipe all transactional data then re-import from the sheet (runs in background). */
export function triggerResyncInBackground(startedBy?: string) {
  if (isSyncing) return { started: false, reason: 'Sync already in progress' }

  isSyncing = true
  void (async () => {
    try {
      await cleanupStaleJobs()
      const config = buildConfigFromEnv()
      const branchKey = await getDefaultBranchKey()
      if (!branchKey) throw new Error('No branch found')
      if (!config.sheetIds.points && !config.sheetIds.employees) {
        throw new Error('GOOGLE_SHEET_ID_POINTS/EMPLOYEES env vars not set')
      }
      await runFullResync(config.sheetIds, config.tabNames, branchKey, startedBy)
    } catch (err) {
      console.error('[sheet-sync] resync error:', err)
    } finally {
      isSyncing = false
    }
  })()

  return { started: true }
}
