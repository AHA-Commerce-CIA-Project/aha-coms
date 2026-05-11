# Spec 03 — Contract Distribution

> **Status: IMPLEMENTED (2026-04-26)** — `@coms-portal/shared` published at `git+https://github.com/mrdoorba/coms-shared.git#v1.1.0`. Portal and Heroes both consume from the published package; local duplicate types removed in Heroes. Option A (Git dependency) was the chosen distribution path.

> Priority: **3 (developer velocity)**
> Scope: Portal (extract) + Heroes (consume)
> Prerequisites: Spec 02 contracts should be finalized first so the extracted package includes app roles

---

## Overview

The portal's shared contracts (`@coms-portal/shared`) live as a workspace package inside the `coms_portal` monorepo. Relying-party apps like Heroes cannot import from it — they duplicate the types locally. Today with one consumer this is manageable. At 3+ services, type drift becomes a real maintenance burden.

### Current Duplication

Heroes duplicates these portal types:

| Portal canonical type | Heroes duplicate location |
|---|---|
| `PortalSessionUser` | `packages/shared/src/auth/session.ts:8-16` |
| `PortalBrokerExchangePayload` | `packages/web/src/lib/server/portal-broker.ts:6-11` |
| `PortalBrokerHandoffResponse` (partial) | `packages/web/src/lib/server/portal-broker.ts:38-43` (as `WireResponse`) |

The Heroes `PortalSessionUser` is already slightly different from the portal's — it uses `portalRole: string` instead of `portalRole: PortalRole`, losing the union type safety.

---

## 1. What to Extract

The `packages/shared/` directory in the portal repo contains:

```
packages/shared/src/
  contracts/
    auth.ts              — PortalClaims, PortalSessionUser, PortalBrokerExchangePayload, etc.
    integration-manifest.ts — PortalIntegrationManifest, PortalAppRole, etc.
    session.ts           — SESSION_COOKIE_OPTIONS
    webhook-events.ts    — Webhook envelope types, event payloads
  constants/
    roles.ts             — re-exports from contracts/auth.ts
  index.ts               — barrel
```

### Extract Everything

All files under `packages/shared/src/contracts/` and `packages/shared/src/constants/` should be in the standalone package. These are pure TypeScript types and constants with zero runtime dependencies — no database, no framework, no Node.js APIs.

The `session.ts` (cookie options) is portal-specific configuration but harmless to include — services can reference it to match cookie settings.

### Package Name

`@coms-portal/shared` — keep the existing workspace package name. The workspace reference (`workspace:*`) in `apps/api/package.json` and `apps/web/package.json` will be replaced with a version reference once published.

---

## 2. Publishing Strategy

### Option A: Git-Based Dependency (recommended for now)

Use `bun add` / `npm install` with a Git URL:

```json
{
  "dependencies": {
    "@coms-portal/shared": "github:mrdoorba/coms-portal-shared#v1.0.0"
  }
}
```

**Pros:**
- No registry setup needed
- Version pinning via Git tags
- Private by default (GitHub repo permissions)
- Works with `bun install`

**Cons:**
- Slower installs (clones repo)
- No semver range resolution (pin exact tags)
- Consumers must have GitHub access

### Option B: GitHub Packages (npm registry)

Publish to GitHub Packages under the `@mrdoorba` scope:

```json
{
  "dependencies": {
    "@mrdoorba/coms-portal-shared": "^1.0.0"
  }
}
```

**Pros:**
- Standard npm workflow
- Semver ranges work
- Fast installs (cached)

**Cons:**
- Requires `.npmrc` with auth token in every consuming repo
- GitHub Packages has occasional reliability issues

### Option C: Bun Workspace Linking (monorepo only)

Keep the package in the portal repo but reference it from Heroes via a file path in CI:

```json
{
  "dependencies": {
    "@coms-portal/shared": "file:../../coms_portal/packages/shared"
  }
}
```

**Pros:** Zero setup.
**Cons:** Only works on dev machines with both repos checked out. Breaks in CI unless repos are co-located.

### Recommendation

**Option A (Git dependency)** for now. The team is small, all repos are private, and it avoids registry setup overhead. Migrate to Option B when a third service onboards and install speed matters.

---

## 3. Standalone Package Structure

Create a new repo `mrdoorba/coms-portal-shared`:

```
coms-portal-shared/
  src/
    contracts/
      auth.ts
      integration-manifest.ts
      session.ts
      webhook-events.ts
    constants/
      roles.ts
    index.ts
  package.json
  tsconfig.json
```

### package.json

```json
{
  "name": "@coms-portal/shared",
  "version": "1.0.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./constants/*": "./src/constants/*.ts",
    "./contracts/*": "./src/contracts/*.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.8"
  }
}
```

No build step needed — consumers import TypeScript source directly (Bun, SvelteKit, and Vite all handle `.ts` imports). If a consumer needs compiled JS, add a `build` script that runs `tsc`.

---

## 4. Versioning Policy

### Semantic Versioning

- **Major** (2.0.0): Breaking changes to existing types (removing fields, changing field types, renaming exports)
- **Minor** (1.1.0): New types, new optional fields, new exports
- **Patch** (1.0.1): Documentation, typo fixes, internal refactors

### Contract Version vs Package Version

The `PLATFORM_AUTH_CONTRACT_VERSION` in `contracts/auth.ts` is a **wire protocol** version — it tells services which version of the auth handoff protocol is in use. It increments independently of the npm package version.

| Change | Contract version | Package version |
|---|---|---|
| Add optional `appRole` to webhook payload | Stays at 1 | 1.1.0 (minor) |
| Change `PortalRole` union values | Bumps to 2 | 2.0.0 (major) |
| Add new `PortalAppRole` type | Stays at 1 | 1.1.0 (minor) |

### Breaking Change Process

1. Bump contract version in the shared package
2. Publish new package version
3. Update portal to produce both old and new formats (V +/- 1 support window)
4. Notify service teams to upgrade within 30 days
5. After all services upgrade, drop old format support

### Release Process

The spec defines versioning rules but the mechanics of cutting a release need to be explicit:

1. **Who:** The portal team owns the shared package repo
2. **When:** Tag a new version whenever contract types change (before deploying portal code that depends on the change)
3. **How:**
   - Update `version` in `package.json`
   - `git tag v{x.y.z}` and push the tag
   - Notify consumers in the team channel with the tag and a one-line changelog
4. **CI check (future):** Add a GitHub Action that runs `bun run typecheck` on push to `main` and on tag creation, so broken types can't be published

### Consumer Upgrade Tracking

At 2 consumers (portal + Heroes), tracking upgrades is a Slack message. At 3+ services, consider:

- A simple dashboard or script that checks each consumer repo's `package.json` for the `@coms-portal/shared` version
- The breaking change notification (step 4 above) should include a deadline and a follow-up reminder

Low priority until a third service onboards.

---

## 5. Portal Migration

### Step 1: Create the Standalone Repo

Copy `packages/shared/src/` to the new repo. Add `package.json` and `tsconfig.json`.

### Step 2: Update Portal Workspace

Replace the workspace package with the Git dependency:

```diff
// apps/api/package.json
- "@coms-portal/shared": "workspace:*",
+ "@coms-portal/shared": "github:mrdoorba/coms-portal-shared#v1.0.0",

// apps/web/package.json
- "@coms-portal/shared": "workspace:*",
+ "@coms-portal/shared": "github:mrdoorba/coms-portal-shared#v1.0.0",
```

Remove `packages/shared/` from the portal workspace and `package.json` workspaces array.

Alternatively, keep the workspace package as a local mirror that re-exports from the Git dependency — this avoids changing import paths but adds indirection.

### Step 3: Verify

Run `bun run typecheck` and `bun run build` in the portal repo to confirm all imports resolve.

---

## 6. Heroes Migration

### Step 1: Add Dependency

```bash
cd /path/to/coms_aha_heroes
bun add @coms-portal/shared@github:mrdoorba/coms-portal-shared#v1.0.0
```

### Step 2: Replace Duplicated Types

**`packages/shared/src/auth/session.ts`**

```diff
- export type PortalSessionUser = {
-   id: string
-   gipUid: string
-   email: string
-   name: string
-   portalRole: string
-   teamIds: string[]
-   apps: string[]
- }
+ import type { PortalSessionUser } from '@coms-portal/shared/contracts/auth'
+ export type { PortalSessionUser }
```

**`packages/web/src/lib/server/portal-broker.ts`**

```diff
- export type PortalBrokerExchangePayload = {
-   appSlug: string
-   brokeredAt: string
-   expiresAt: string
-   redirectTo: string | null
-   sessionUser: PortalSessionUser
- }
+ import type { PortalBrokerExchangePayload } from '@coms-portal/shared/contracts/auth'

- type WireResponse = { ... }
+ import type { PortalBrokerHandoffResponse } from '@coms-portal/shared/contracts/auth'
+ // Use PortalBrokerHandoffResponse instead of WireResponse
```

### Step 3: Verify

```bash
bun run typecheck
```

---

## Files Modified

### New Repo: `mrdoorba/coms-portal-shared`

All files from `packages/shared/src/` copied to new repo.

### Portal

| File | Change |
|------|--------|
| `package.json` | Remove `packages/shared` from workspaces (if fully extracting) |
| `apps/api/package.json` | `workspace:*` → Git dependency |
| `apps/web/package.json` | `workspace:*` → Git dependency |
| `packages/shared/` | Removed or kept as re-export shim |

### Heroes (see handoff doc)

| File | Change |
|------|--------|
| `package.json` | Add `@coms-portal/shared` dependency |
| `packages/shared/src/auth/session.ts` | Import `PortalSessionUser` from shared |
| `packages/web/src/lib/server/portal-broker.ts` | Import types from shared, remove local duplicates |
