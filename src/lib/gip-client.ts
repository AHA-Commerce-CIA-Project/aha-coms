import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_GIP_API_KEY,
  // Use the app's own domain so the auth handler runs same-origin (proxied to Firebase).
  // Falls back to the Firebase domain on the server where window is unavailable.
  authDomain:
    typeof window !== 'undefined'
      ? window.location.host
      : (import.meta.env.VITE_GIP_AUTH_DOMAIN ?? ''),
  projectId: import.meta.env.VITE_GIP_PROJECT_ID,
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp()

export const clientAuth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()
