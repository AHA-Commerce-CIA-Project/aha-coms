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
      appCatalog: readonly { slug: string; label: string; url: string }[]
    }
    interface PageData {
      user: AuthUser | null
    }
  }
}

export {}
