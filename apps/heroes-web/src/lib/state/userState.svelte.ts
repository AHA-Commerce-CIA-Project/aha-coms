import type { AuthUser } from '@coms/shared/types'

class UserState {
  current = $state<AuthUser | null>(null)
  isAdmin = $derived(this.current?.role === 'admin')
  isHR = $derived(this.current?.role === 'hr' || this.isAdmin)
  isLeader = $derived(this.current?.role === 'leader' || this.isHR)

  init(user: AuthUser | null) {
    this.current = user
  }

  clear() {
    this.current = null
  }
}

export const userState = new UserState()
