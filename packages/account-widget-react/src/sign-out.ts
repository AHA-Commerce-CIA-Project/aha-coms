export interface SignOutOptions {
  portalOrigin: string;
  postLogoutRedirectUri: string;
  idTokenHint?: string;
}

/**
 * RP-initiated OIDC logout — top-level browser navigation to portal's
 * `GET /api/auth/logout`. Never resolves on success; the script context dies
 * after `window.location.assign(...)`. Mirrors the Svelte sibling's contract
 * verbatim — do NOT swap to `fetch`; the portal returns a 303 the browser
 * must follow as a top-level navigation.
 */
export function signOut(options: SignOutOptions): void {
  if (typeof window === 'undefined') {
    throw new Error(
      'signOut() requires a browser window — call it from a client-side handler.',
    );
  }

  const params = new URLSearchParams({
    post_logout_redirect_uri: options.postLogoutRedirectUri,
  });
  if (options.idTokenHint) {
    params.set('id_token_hint', options.idTokenHint);
  }

  const trimmedOrigin = options.portalOrigin.endsWith('/')
    ? options.portalOrigin.slice(0, -1)
    : options.portalOrigin;

  window.location.assign(`${trimmedOrigin}/api/auth/logout?${params.toString()}`);
}
