import type { PageServerLoad } from './$types'

// Phase 2 (Spec 02 / T33–T35) retired heroes' local session cookie. The
// portal-initiated logout flow clears its own `__session` cookie on the
// portal side; heroes has nothing to clean up locally. This route exists
// as the OIDC RP-initiated `post_logout_redirect_uri` landing page —
// portal redirects the browser here after clearing the session, the page
// renders a confirmation, the user can sign in again.
export const load: PageServerLoad = async () => {
  return {}
}
