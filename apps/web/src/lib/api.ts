import { treaty } from '@elysiajs/eden'
import type { App } from '@coms-portal/api/src/index'

export const api = treaty<App>(
  typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
)
