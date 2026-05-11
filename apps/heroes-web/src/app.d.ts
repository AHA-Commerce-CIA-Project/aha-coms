import type { AuthUser } from '@coms-portal/heroes-shared/types'

declare global {
  namespace App {
    interface Locals {
      user: AuthUser | null
      session: {
        id: string
        userId: string
        expiresAt: Date
      } | null
    }
    interface PageData {
      user: AuthUser | null
    }
  }
}

export {}
