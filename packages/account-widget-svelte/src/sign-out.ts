/**
 * RP-initiated OIDC logout helper.
 *
 * The widget's sign-out action calls this helper, which performs a top-level
 * browser navigation to the portal's `GET /api/auth/logout` endpoint with
 * `post_logout_redirect_uri` (and optionally `id_token_hint`). The portal
 * validates the redirect URI against its app_registry allowlist, clears the
 * session cookie, and 303-redirects back.
 *
 * The function never resolves on success — `window.location.assign` triggers
 * the navigation and the script context dies. It throws synchronously when
 * `window` is unavailable (SSR / test environments) so callers can detect
 * misuse.
 */
export interface SignOutOptions {
  /** Portal origin, e.g. "https://coms.ahacommerce.net". Required. */
  portalOrigin: string

  /**
   * Where the portal should send the user after sign-out completes. Must be
   * an origin allowlisted in the portal's app_registry. Required by the OIDC
   * RP-initiated logout contract.
   */
  postLogoutRedirectUri: string

  /**
   * Optional id_token_hint for cross-IdP logout (reserved; not exercised
   * server-side in Rev 3 but accepted for forward compatibility).
   */
  idTokenHint?: string
}

export function signOut(options: SignOutOptions): void {
  if (typeof window === 'undefined') {
    throw new Error('signOut() requires a browser window — call it from a client-side handler.')
  }

  const params = new URLSearchParams({
    post_logout_redirect_uri: options.postLogoutRedirectUri,
  })
  if (options.idTokenHint) {
    params.set('id_token_hint', options.idTokenHint)
  }

  const trimmedOrigin = options.portalOrigin.endsWith('/')
    ? options.portalOrigin.slice(0, -1)
    : options.portalOrigin

  window.location.assign(`${trimmedOrigin}/api/auth/logout?${params.toString()}`)
}
