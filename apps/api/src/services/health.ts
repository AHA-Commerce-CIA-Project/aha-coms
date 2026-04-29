import { sql } from 'drizzle-orm'
import { GoogleAuth } from 'google-auth-library'
import { db } from '~/db'

const PROBE_TIMEOUT_MS = 500

type CheckResult = 'ok' | 'failed'

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('probe timeout')), ms),
    ),
  ])
}

async function checkDb(): Promise<CheckResult> {
  try {
    await withTimeout(db.execute(sql`SELECT 1`), PROBE_TIMEOUT_MS)
    return 'ok'
  } catch {
    return 'failed'
  }
}

const smAuth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
})

async function checkSecretManager(): Promise<CheckResult> {
  try {
    const projectId = process.env.GCP_PROJECT_ID
    if (!projectId) return 'failed'

    const token = await withTimeout(smAuth.getAccessToken(), PROBE_TIMEOUT_MS)
    if (!token) return 'failed'

    // Find an active broker key secret name to probe
    const { portalBrokerSigningKeys } = await import('~/db/schema/signing-keys')
    const { eq } = await import('drizzle-orm')
    const rows = await withTimeout(
      db
        .select({ privateSecretName: portalBrokerSigningKeys.privateSecretName })
        .from(portalBrokerSigningKeys)
        .where(eq(portalBrokerSigningKeys.status, 'active'))
        .limit(1),
      PROBE_TIMEOUT_MS,
    )

    if (!rows[0]) return 'ok' // no key yet — SM itself is reachable

    const secretName = rows[0].privateSecretName
    const url = `https://secretmanager.googleapis.com/v1/projects/${projectId}/secrets/${encodeURIComponent(secretName)}/versions/latest:access`
    const res = await withTimeout(
      fetch(url, { headers: { Authorization: `Bearer ${token}` } }),
      PROBE_TIMEOUT_MS,
    )
    return res.ok ? 'ok' : 'failed'
  } catch {
    return 'failed'
  }
}

async function checkCloudTasks(): Promise<CheckResult> {
  try {
    const projectId = process.env.GCP_PROJECT_ID
    const location = process.env.CLOUD_TASKS_LOCATION
    const queue = process.env.CLOUD_TASKS_QUEUE
    if (!projectId || !location || !queue) return 'failed'

    const token = await withTimeout(smAuth.getAccessToken(), PROBE_TIMEOUT_MS)
    if (!token) return 'failed'

    const url = `https://cloudtasks.googleapis.com/v2/projects/${projectId}/locations/${location}/queues/${queue}`
    const res = await withTimeout(
      fetch(url, { headers: { Authorization: `Bearer ${token}` } }),
      PROBE_TIMEOUT_MS,
    )
    return res.ok ? 'ok' : 'failed'
  } catch {
    return 'failed'
  }
}

export interface HealthResult {
  status: 'ok' | 'degraded'
  checks: {
    db: CheckResult
    secretManager: CheckResult
    cloudTasks: CheckResult
  }
}

export async function probeHealth(): Promise<HealthResult> {
  const [db, secretManager, cloudTasks] = await Promise.all([
    checkDb(),
    checkSecretManager(),
    checkCloudTasks(),
  ])

  const status = db === 'ok' && secretManager === 'ok' && cloudTasks === 'ok' ? 'ok' : 'degraded'
  return { status, checks: { db, secretManager, cloudTasks } }
}
