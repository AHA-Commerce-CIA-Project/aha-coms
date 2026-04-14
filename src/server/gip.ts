import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app'

/**
 * Initialize Firebase Admin SDK once.
 * On Cloud Run, uses the default service account via applicationDefault().
 * For local dev, set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON key path.
 */
export function initGip() {
  if (getApps().length === 0) {
    initializeApp({
      credential: applicationDefault(),
      projectId: process.env.GIP_PROJECT_ID,
    })
  }
}
