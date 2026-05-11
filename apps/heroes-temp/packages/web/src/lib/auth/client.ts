// Auth is brokered by the COMS portal. The previous better-auth client has
// been removed; only logout remains client-side. The endpoint clears the local
// session cookie and 303-redirects the browser to the portal logout page.

export function signOut(): void {
  if (typeof window !== 'undefined') {
    window.location.assign('/auth/portal/logout')
  }
}
