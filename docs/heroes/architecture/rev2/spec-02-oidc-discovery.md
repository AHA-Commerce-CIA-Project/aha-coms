# Rev 2 — Spec 02: OIDC Discovery Endpoint

> Priority: **2 (small, high-leverage for onboarding velocity)**
> Scope: Portal only
> Prerequisites: Spec 01 (JWKS endpoint must exist before discovery references it)

---

## Overview

A discovery document is a single static-ish JSON resource at `/.well-known/openid-configuration` that describes the IdP's capabilities to a client. Once published, a new relying-party app can:

1. Configure a stock OIDC client library (`openid-client`, `next-auth`, `passport-azure-ad`, MSAL, `@panva/jose`'s `discoveryRequest`) by giving it just the portal origin.
2. Auto-discover `jwks_uri`, supported algorithms, issuer name, and endpoint URLs without out-of-band documentation.
3. Skip writing bespoke broker-token verification code — the library handles JWKS fetching, kid selection, alg negotiation, and clock-skew tolerance.

We are **not** becoming fully OIDC-compliant. Our flow is still a one-time-code exchange, not the standard authorization-code-with-openid-scope flow. The discovery document will be honest about what we don't support — fields like `response_types_supported` will list only what we actually do, and unsupported features will be omitted (which OIDC clients interpret as "not supported").

The discovery document is a documentation contract. It costs us a static route and pays back at onboarding time.

---

## Endpoint

`GET /.well-known/openid-configuration`

Mounted in the same `wellKnownRoutes` Elysia plugin as `/jwks.json` from Spec 01.

---

## Document Structure

```json
{
  "issuer": "https://coms.ahacommerce.net/broker",
  "jwks_uri": "https://coms.ahacommerce.net/.well-known/jwks.json",

  "broker_launch_endpoint": "https://coms.ahacommerce.net/api/auth/broker/launch/{appSlug}",
  "broker_exchange_endpoint": "https://coms.ahacommerce.net/api/auth/broker/exchange",
  "introspection_endpoint": "https://coms.ahacommerce.net/api/auth/broker/introspect",

  "id_token_signing_alg_values_supported": ["ES256"],
  "introspection_endpoint_auth_methods_supported": ["google_oidc"],
  "broker_exchange_auth_methods_supported": ["one_time_code"],

  "response_types_supported": ["code"],
  "subject_types_supported": ["public"],

  "claims_supported": [
    "sub",
    "email",
    "name",
    "iss",
    "aud",
    "iat",
    "exp",
    "portal_role",
    "team_ids",
    "apps",
    "app_role",
    "branch"
  ],

  "service_documentation": "https://github.com/mrdoorba/coms-portal/blob/main/docs/architecture/rev2/spec-01-rs256-jwks.md",

  "x-coms-platform-auth-contract-version": 1,
  "x-coms-supported-app-transports": ["same_host_cookie", "portable_token"],
  "x-coms-supported-handoff-modes": ["one_time_code", "token_exchange"],
  "x-coms-webhook-events_supported": [
    "user.provisioned",
    "user.updated",
    "user.offboarded",
    "session.revoked"
  ]
}
```

### Field-by-field rationale

| Field | Purpose |
|-------|---------|
| `issuer` | The `iss` claim in broker tokens. Clients use this for verification. |
| `jwks_uri` | Public verification keys. Clients cache 10min. |
| `broker_launch_endpoint` | Bookmark for documentation; not used directly by OIDC libraries since our launch is non-standard (POST form). |
| `broker_exchange_endpoint` | Where one-time codes are exchanged for sessions. |
| `introspection_endpoint` | RFC 7662 introspection — Heroes already calls this. |
| `id_token_signing_alg_values_supported` | Drives `algorithms` allow-list in `jwtVerify`. |
| `introspection_endpoint_auth_methods_supported` | After Spec 04 ships, this becomes `["google_oidc"]`. During Spec 04 dual-mode, we list both `["google_oidc", "client_secret_header"]`. |
| `broker_exchange_auth_methods_supported` | Documents that we use one-time-code (not client_secret_basic / private_key_jwt). |
| `response_types_supported` | We do return a "code" (the one-time `portal_code`). |
| `subject_types_supported` | `"public"` — `sub` is a stable global user ID, not pairwise-per-client. |
| `claims_supported` | What broker tokens carry. Includes Rev 1 §02 enrichments (`app_role`, `branch`). |
| `x-coms-*` | Custom extensions, namespaced with `x-coms-` so OIDC clients ignore them but our own internal tooling can read them. |

### Fields deliberately omitted

- `authorization_endpoint` — we don't have a standard authz endpoint. Omitting signals "not supported."
- `token_endpoint` — same reason. Our exchange endpoint is one-time-code, not OAuth2 token grant.
- `userinfo_endpoint` — we don't expose one (introspect covers the use case). May add later.
- `revocation_endpoint` — webhook-based revocation, not pull-based. Document in `x-coms-webhook-events_supported` instead.
- `code_challenge_methods_supported` — no PKCE.
- `scopes_supported` — no scopes; the broker token covers everything the user is entitled to in the audience app.

OIDC clients reading this document will correctly conclude: "this is a JWKS-publishing IdP that exposes introspection and broker exchange but not the standard authorization code flow." That's exactly true.

---

## Implementation

`apps/api/src/routes/well-known.ts` (extends Spec 01):

```typescript
const DISCOVERY_DOCUMENT_CACHE_S = 3600  // 1 hour — content rarely changes

const PORTAL_ORIGIN = process.env.PORTAL_PUBLIC_ORIGIN ?? 'https://coms.ahacommerce.net'

const discoveryDocument = {
  issuer: `${PORTAL_ORIGIN}/broker`,
  jwks_uri: `${PORTAL_ORIGIN}/.well-known/jwks.json`,
  broker_launch_endpoint: `${PORTAL_ORIGIN}/api/auth/broker/launch/{appSlug}`,
  broker_exchange_endpoint: `${PORTAL_ORIGIN}/api/auth/broker/exchange`,
  introspection_endpoint: `${PORTAL_ORIGIN}/api/auth/broker/introspect`,
  id_token_signing_alg_values_supported: ['ES256'],
  introspection_endpoint_auth_methods_supported: ['google_oidc'],
  broker_exchange_auth_methods_supported: ['one_time_code'],
  response_types_supported: ['code'],
  subject_types_supported: ['public'],
  claims_supported: [
    'sub', 'email', 'name', 'iss', 'aud', 'iat', 'exp',
    'portal_role', 'team_ids', 'apps', 'app_role', 'branch',
  ],
  service_documentation:
    'https://github.com/mrdoorba/coms-portal/blob/main/docs/architecture/rev2/spec-01-rs256-jwks.md',
  'x-coms-platform-auth-contract-version': PLATFORM_AUTH_CONTRACT_VERSION,
  'x-coms-supported-app-transports': ['same_host_cookie', 'portable_token'],
  'x-coms-supported-handoff-modes': ['one_time_code', 'token_exchange'],
  'x-coms-webhook-events_supported': [
    'user.provisioned',
    'user.updated',
    'user.offboarded',
    'session.revoked',
  ],
}

wellKnownRoutes.get('/openid-configuration', ({ set }) => {
  set.headers['cache-control'] = `public, max-age=${DISCOVERY_DOCUMENT_CACHE_S}`
  set.headers['content-type'] = 'application/json'
  return discoveryDocument
})
```

The document is a constant — no DB query, no per-request work. Build once at module load.

---

## Issuer Naming

Note that `issuer` is `${PORTAL_ORIGIN}/broker`, not just `${PORTAL_ORIGIN}`. This matches the existing `PORTAL_BROKER_ISSUER` constant (`coms-portal-broker` in the current code becomes `https://coms.ahacommerce.net/broker` after this spec).

**Why a URL-form issuer:** OIDC requires `issuer` to be an HTTPS URL (RFC 8414). Stock libraries fail discovery if it's a bare string. We stop using `coms-portal-broker` as the literal `iss` claim and start using the URL.

This is a **broker token claim change** — needs to be rolled out together with Spec 01's HS256 → ES256 migration. While in dual-mode, both old (`coms-portal-broker`) and new (`https://coms.ahacommerce.net/broker`) issuers must be accepted by Heroes verification. After dual-mode period, drop the legacy value.

Alternative considered: keep `iss = coms-portal-broker` and accept that the discovery document is technically non-compliant on that one field. Rejected because the cost of the rename is one constant change and a verifier-side allow-list, vs. the benefit of stock OIDC client libraries actually working.

---

## Out of Scope

- **Authorization endpoint, token endpoint, PKCE, scopes, userinfo, registration endpoint.** This spec doesn't add any of those. Document is honest about not supporting them.
- **Auto-rotation of the issuer URL** if the portal moves domains. Manual config update for now.
- **Multiple environments** (staging, prod) with different discovery docs. Today the doc reads from `PORTAL_PUBLIC_ORIGIN`; same-document-different-env is the right pattern.

---

## Migration & Compatibility

- Discovery is purely additive; no consumer is required to use it.
- Heroes does not need to consume discovery in this spec. Heroes already hardcodes the JWKS URL after Spec 01.
- A future third app onboarding can use discovery; existing apps continue with hardcoded URLs.
- After Spec 04, update `introspection_endpoint_auth_methods_supported` from `["google_oidc", "client_secret_header"]` (dual-mode) to `["google_oidc"]` (post-migration).

---

## Files Modified

### Portal

| File | Change |
|------|--------|
| `apps/api/src/routes/well-known.ts` | Add `/openid-configuration` route alongside `/jwks.json` |
| `apps/api/src/services/auth-broker.ts` | Update `PORTAL_BROKER_ISSUER` constant from `coms-portal-broker` to `${PORTAL_ORIGIN}/broker` |
| `apps/api/src/routes/auth.ts` | Verifier-side accepts both old and new issuer during transition |
| `packages/shared/src/contracts/auth.ts` | Update issuer documentation in source comments |

### Heroes

| File | Change |
|------|--------|
| `packages/web/src/lib/server/portal-broker.ts` | Verifier accepts both `coms-portal-broker` (legacy) and `${PORTAL_ORIGIN}/broker` (new) during transition |

This is the only Heroes-side touchpoint for Spec 02, and it overlaps with the Spec 01 verification swap — bundle them together in H1.

---

## Success Criteria

1. `GET https://coms.ahacommerce.net/.well-known/openid-configuration` returns valid JSON.
2. `npx openid-client https://coms.ahacommerce.net` (or equivalent test command) successfully discovers and lists endpoints.
3. The advertised `jwks_uri` resolves and the keys it returns successfully verify a fresh broker token.
4. Heroes accepts the new URL-form issuer claim end-to-end.
5. A short onboarding doc for a hypothetical third app is added that says: "Point your OIDC client at `https://coms.ahacommerce.net/.well-known/openid-configuration` and you're done with broker verification — see `webhook-onboarding.md` for the rest."
