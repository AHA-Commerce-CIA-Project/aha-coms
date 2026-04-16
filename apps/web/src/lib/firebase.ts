import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_GIP_API_KEY,
  authDomain: import.meta.env.VITE_GIP_AUTH_DOMAIN ?? '',
  projectId: import.meta.env.VITE_GIP_PROJECT_ID,
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp()

export const clientAuth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()
