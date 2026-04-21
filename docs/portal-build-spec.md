# COMS System (Company Support System) — Build Specification

> **Purpose**: This document contains everything needed to build the COMS System from scratch in a new repository. It is written for an AI coding agent (Claude Code, Cursor, etc.) to pick up and execute.

---

## 1. Project Overview

Build a unified identity portal for internal company use. Employees log in once at `coms.ahacommerce.net` and access all internal web apps via path-based routing (`coms.ahacommerce.net/heroes/`, `coms.ahacommerce.net/fast/`, etc.) without re-login.

### Routing Strategy (Mixed Approach)

- **Portal**: `coms.ahacommerce.net` (root — login, dashboard, admin)
- **Web apps**: path-based under same domain — `coms.ahacommerce.net/<app-slug>/`
- Examples:
  - `coms.ahacommerce.net/heroes/` → AHA Heroes
  - `coms.ahacommerce.net/fast/` → FAST app
- Session cookie set on `coms.ahacommerce.net` (no subdomain scoping needed — same domain)
- Each app is deployed as a separate Cloud Run service, fronted by a load balancer with path-based routing rules

### Core Features

1. **Login page** — Google OAuth + email/password via Google Identity Platform (GIP)
2. **App launcher dashboard** — shows apps the logged-in user can access (based on team assignment)
3. **Team management** — CRUD teams, assign employees to teams, assign apps to teams
4. **Employee management** — CRUD employees, provision GIP accounts, replace spreadsheet as source of truth
5. **Session cookie minting** — cookie on `coms.ahacommerce.net` enables SSO across all path-based apps

### What This Is NOT

- Not rebuilding any existing app
- Not a micro-frontend or app embedder
- Not merging databases across apps

---

## 2. Tech Stack

| Layer | Technology | Reason |
|-------|-----------|--------|
| Runtime | Bun | Company standard (used in heroes app) |
| Framework | TanStack Start + Elysia (Eden) | Same stack as heroes app. Reuse patterns, type-safe frontend↔backend via Eden Treaty. |
| Database | PostgreSQL on Cloud SQL | Same instance as heroes (different database), Drizzle ORM |
| ORM | Drizzle ORM + postgres-js | Company standard |
| Auth | Google Identity Platform (GIP) | Central IdP, free for <50K MAU, native GCP integration |
| Auth SDK | firebase-admin (server), firebase (client) | GIP uses Firebase SDK underneath |
| Styling | Tailwind CSS + shadcn/ui | Fast to build admin UIs |
| Deployment | Cloud Run (asia-southeast2 (Jakarta)) | Same region as other apps |
| Load Balancer | GCP HTTPS LB | Path-based routing to Cloud Run services |
| DNS/SSL | Cloudflare | Manages ahacommerce.net domain |

### Key Dependencies

```json
{
  "dependencies": {
    "@tanstack/react-router": "^1",
    "@tanstack/react-start": "^1",
    "@tanstack/react-query": "^5",
    "elysia": "^1.3",
    "@elysiajs/eden": "^1.3",
    "react": "^19",
    "drizzle-orm": "^0.45.0",
    "postgres": "^3.4.5",
    "firebase": "^11",
    "firebase-admin": "^13",
    "tailwindcss": "^4",
    "zod": "^3",
    "vinxi": "^0.5"
  },
  "devDependencies": {
    "drizzle-kit": "^0.31",
    "typescript": "^5.8"
  }
}
```

---

## 3. GCP Infrastructure

### Existing Environment

- **GCP Project ID**: `<your-gcp-project>`
- **Region**: `asia-southeast2 (Jakarta)`
- **Cloud SQL**: Already running (db-f1-micro, shared vCPU, user: `app`)
- **GitHub Org**: `mrdoorba`
- **Secrets**: Via GCP Secret Manager
- **Service Accounts**: Workload Identity Federation for GitHub Actions

### New Resources Needed

| Resource | Name | Notes |
|----------|------|-------|
| Cloud Run service | `coms-system-app` | Same project, same region |
| Cloud SQL database | `coms_system` | New database on EXISTING Cloud SQL instance |
| HTTPS Load Balancer | `coms-system-lb` | Path-based routing: `/` → coms-system-app, `/heroes/*` → heroes, etc. |
| GIP setup | Enable Identity Platform | On existing GCP project, enable providers |
| Secret Manager | `COMS_DATABASE_URL`, `GIP_API_KEY` | New secrets |
| Cloudflare DNS | `coms.ahacommerce.net` → GCP LB | CNAME record |

### Environment Variables

```env
# Database
DATABASE_URL=postgresql://app:***@/coms_system?host=/cloudsql/<your-gcp-project>:asia-southeast2 (Jakarta):***

# Google Identity Platform
GIP_PROJECT_ID=<your-gcp-project>
GIP_API_KEY=***
GIP_AUTH_DOMAIN=<your-gcp-project>.firebaseapp.com

# Firebase Admin (server-side)
GOOGLE_APPLICATION_CREDENTIALS=*** # or use default Cloud Run SA

# App Config
COMS_DOMAIN=coms.ahacommerce.net
SESSION_COOKIE_MAX_AGE=1209600  # 14 days in seconds

# App Registry (initial setup — path-based routing)
APP_HEROES_PATH=/heroes
APP_FAST_PATH=/fast
```

---

## 4. Database Schema

### Central Identity Database (`coms_system`)

```sql
-- Employees (source of truth, replaces spreadsheet)
CREATE TABLE identity_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gip_uid TEXT UNIQUE,                          -- Google Identity Platform UID (null until account provisioned)
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  department VARCHAR(100),
  position VARCHAR(100),
  portal_role VARCHAR(20) NOT NULL DEFAULT 'employee',  -- 'admin', 'employee'
  has_google_workspace BOOLEAN NOT NULL DEFAULT false,
  status VARCHAR(20) NOT NULL DEFAULT 'active',         -- 'active', 'inactive', 'suspended'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Teams (access control groups, NOT the same as app-internal teams)
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Team membership
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  role_in_team VARCHAR(20) NOT NULL DEFAULT 'member',  -- 'member', 'lead'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_id, user_id)
);

-- App registry
CREATE TABLE app_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(50) NOT NULL UNIQUE,        -- e.g. 'heroes', 'fast'
  name VARCHAR(100) NOT NULL,              -- e.g. 'AHA Heroes'
  description TEXT,
  url VARCHAR(500) NOT NULL,               -- e.g. 'https://coms.ahacommerce.net/heroes/'
  base_path VARCHAR(100) NOT NULL,          -- e.g. '/heroes' (used by LB routing rules)
  icon_url TEXT,                            -- app icon for launcher
  cloud_run_service VARCHAR(100),           -- e.g. 'coms-aha-heroes-app'
  status VARCHAR(20) NOT NULL DEFAULT 'active',  -- 'active', 'maintenance', 'deprecated'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Which teams can access which apps
CREATE TABLE team_app_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  app_id UUID NOT NULL REFERENCES app_registry(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES identity_users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_id, app_id)
);

-- Audit log
CREATE TABLE access_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES identity_users(id),
  action VARCHAR(50) NOT NULL,             -- 'grant_app_access', 'revoke_app_access', 'add_team_member', etc.
  target_type VARCHAR(50) NOT NULL,        -- 'team', 'user', 'app'
  target_id UUID NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_identity_users_email ON identity_users(email);
CREATE INDEX idx_identity_users_gip_uid ON identity_users(gip_uid);
CREATE INDEX idx_identity_users_status ON identity_users(status);
CREATE INDEX idx_team_members_user ON team_members(user_id);
CREATE INDEX idx_team_members_team ON team_members(team_id);
CREATE INDEX idx_team_app_access_team ON team_app_access(team_id);
CREATE INDEX idx_team_app_access_app ON team_app_access(app_id);
CREATE INDEX idx_audit_log_actor ON access_audit_log(actor_id);
CREATE INDEX idx_audit_log_created ON access_audit_log(created_at);
```

### Drizzle Schema Files

Create these in `src/db/schema/`:

- `identity-users.ts` — identity_users table
- `teams.ts` — teams + team_members tables
- `apps.ts` — app_registry + team_app_access tables
- `audit.ts` — access_audit_log table
- `index.ts` — barrel export

---

## 5. Authentication Flow

### 5.1 Login Flow

```
Browser                        Portal Server                    GIP
  |                                |                              |
  | GET coms.ahacommerce.net           |                              |
  |------------------------------->|                              |
  |                                |                              |
  | Show login page                |                              |
  |<-------------------------------|                              |
  |                                |                              |
  | Click "Sign in with Google"    |                              |
  | OR submit email/password       |                              |
  |------------------------------->|                              |
  |                                |                              |
  |                  signInWithPopup() or                         |
  |                  signInWithEmailAndPassword()                 |
  |                                |----------------------------->|
  |                                |                              |
  |                                |<-- Firebase ID token --------|
  |                                |                              |
  | POST /api/auth/session         |                              |
  |   { idToken }                  |                              |
  |------------------------------->|                              |
  |                                |                              |
  |                  1. verifyIdToken(idToken)                    |
  |                  2. Look up identity_users by email           |
  |                  3. If not found → 403 "Contact admin"        |
  |                  4. Resolve team memberships + app access     |
  |                  5. Set custom claims on GIP user:            |
  |                     { portalRole, teamIds, apps: [...] }      |
  |                  6. createSessionCookie(idToken, { expiresIn: 14 days })
  |                                |                              |
  | Set-Cookie: __session=<cookie> |                              |
  |   Domain=coms.ahacommerce.net |                              |
  |   HttpOnly; Secure; SameSite=Lax; Path=/                     |
  |<-------------------------------|                              |
  |                                |                              |
  | Redirect to / (app launcher)   |                              |
  |------------------------------->|                              |
```

### 5.2 Session Cookie Configuration

```typescript
const SESSION_COOKIE_OPTIONS = {
  name: '__session',
  // No domain needed — cookie defaults to coms.ahacommerce.net (exact host)
  // All apps are path-based on same domain, so cookie is sent automatically
  path: '/',
  httpOnly: true,
  secure: true,                 // HTTPS only
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 24 * 14,   // 14 days
}
```

### 5.3 Custom Claims Structure

```typescript
// Set on GIP user after login, carried in session cookie
interface PortalClaims {
  claimsVersion: 1
  portalRole: 'admin' | 'employee'
  teamIds: string[]           // UUIDs of teams user belongs to
  apps: string[]              // slugs of apps user can access, e.g. ['heroes', 'fast']
  claimsUpdatedAt: number     // Unix timestamp, for staleness check
}
```

### 5.4 Claims Refresh

When team assignments change:

```typescript
// 1. Update DB
await db.insert(teamMembers).values({ teamId, userId })

// 2. Resolve new claims
const apps = await resolveUserApps(userId)
const teams = await resolveUserTeams(userId)

// 3. Update GIP custom claims
await getAuth().setCustomUserClaims(user.gipUid, {
  portalRole: user.portalRole,
  teamIds: teams.map(t => t.id),
  apps: apps.map(a => a.slug),
  claimsUpdatedAt: Date.now(),
})

// 4. Note: existing session cookies carry old claims until user re-logs in
//    or client calls getIdToken(true) to force refresh.
//    Acceptable for 250 users — max 1hr propagation delay.
```

---

## 6. API Routes

### Auth Routes (public — no authPlugin)

All served via Elysia under `/api/auth/*`:

```
POST   /api/auth/session          — Exchange Firebase ID token for session cookie
POST   /api/auth/logout            — Clear session cookie, revoke GIP session
GET    /api/auth/me                — Return current user + accessible apps
```

### Protected Routes (Elysia `/api/v1/*` group — authPlugin middleware)

All routes below use Eden Treaty for type-safe frontend calls. Elysia route definitions export types consumed by `treaty<App>()`.

**Employee Routes** (admin only — `requireRole('admin')`):

```
GET    /api/v1/employees           — List all employees (paginated, searchable)
POST   /api/v1/employees           — Create employee + provision GIP account
GET    /api/v1/employees/:id       — Get employee details
PATCH  /api/v1/employees/:id       — Update employee
DELETE /api/v1/employees/:id       — Deactivate employee (soft delete) + disable GIP account
POST   /api/v1/employees/import    — Bulk import from CSV/spreadsheet
```

**Team Routes** (admin only):

```
GET    /api/v1/teams               — List all teams with member count
POST   /api/v1/teams               — Create team
GET    /api/v1/teams/:id           — Get team with members and app access
PATCH  /api/v1/teams/:id           — Update team
DELETE /api/v1/teams/:id           — Delete team
POST   /api/v1/teams/:id/members   — Add member to team
DELETE /api/v1/teams/:id/members/:userId — Remove member from team
```

**App Registry Routes** (admin only):

```
GET    /api/v1/apps                — List all registered apps
POST   /api/v1/apps                — Register new app
PATCH  /api/v1/apps/:id            — Update app info
DELETE /api/v1/apps/:id            — Deregister app
```

**Team-App Access Routes** (admin only):

```
POST   /api/v1/teams/:id/apps      — Grant team access to an app
DELETE /api/v1/teams/:id/apps/:appId — Revoke team access to an app
```

**Dashboard Route** (any authenticated user):

```
GET    /api/v1/dashboard           — Return apps accessible to current user
```

### Elysia Server Structure

```typescript
// src/server/index.ts — same pattern as heroes app
import { Elysia } from 'elysia'
import { authRoutes } from './routes/auth'
import { employeeRoutes } from './routes/employees'
import { teamRoutes } from './routes/teams'
import { appRoutes } from './routes/apps'
import { accessRoutes } from './routes/access'
import { dashboardRoutes } from './routes/dashboard'
import { authPlugin } from './middleware/auth'

export const app = new Elysia({ prefix: '/api' })
  .get('/health', () => ({ status: 'ok' }))
  .use(authRoutes)                          // /api/auth/* (public)
  .group('/v1', (app) =>
    app
      .use(authPlugin)                      // session cookie verification
      .use(employeeRoutes)
      .use(teamRoutes)
      .use(appRoutes)
      .use(accessRoutes)
      .use(dashboardRoutes)
  )

export type App = typeof app                // Eden Treaty consumes this type
```

---

## 7. Pages / UI

### Public Pages (outside `_authed` layout)

| Route | File | Description |
|-------|------|-------------|
| `/login` | `login.tsx` | Google button + email/password form. Language switcher (id/en). |
| `/forgot-password` | `forgot-password.tsx` | Email input → GIP sends reset email |

### Authenticated Pages (`_authed` layout — session check in `beforeLoad`)

| Route | File | Description |
|-------|------|-------------|
| `/` | `_authed/index.tsx` | App launcher grid. Shows apps user can access. Click → navigate to app URL. |
| `/profile` | `_authed/profile.tsx` | View/edit own name, email, password |

### Admin Pages (`_authed/admin/*` — requires `admin` portal role)

| Route | File | Description |
|-------|------|-------------|
| `/admin/employees` | `admin/employees.tsx` | Table with search, filter by status/team. Bulk import button. |
| `/admin/employees/new` | `admin/employees.new.tsx` | Form: name, email, phone, department, position, team assignment |
| `/admin/employees/$id` | `admin/employees.$id.tsx` | Edit employee, view team memberships, view app access |
| `/admin/teams` | `admin/teams.tsx` | Table of teams with member count, app count |
| `/admin/teams/new` | `admin/teams.new.tsx` | Form: name, description |
| `/admin/teams/$id` | `admin/teams.$id.tsx` | Member list (add/remove), app access list (grant/revoke) |
| `/admin/apps` | `admin/apps.tsx` | App registry |
| `/admin/audit` | `admin/audit.tsx` | Searchable log of all access changes |

### App Launcher Card Design

```
┌─────────────────────┐
│  [App Icon]          │
│                      │
│  AHA Heroes          │
│  Employee recognition│
│                      │
│  ● Active            │
└─────────────────────┘
```

Cards link to path-based URLs (e.g., `https://coms.ahacommerce.net/heroes/`). Same domain, so session cookie is sent automatically — no cross-domain cookie issues.

### Auth Guard Pattern (TanStack Router `beforeLoad`)

```typescript
// src/routes/_authed.tsx — same pattern as heroes app
import { createFileRoute, redirect } from '@tanstack/react-router'
import { getSessionFn } from '~/server/functions/auth'

export const Route = createFileRoute('/_authed')({
  beforeLoad: async () => {
    const session = await getSessionFn()
    if (!session) {
      throw redirect({ to: '/login' })
    }
    return { session }
  },
  component: AuthedLayout,
})
```

---

## 8. Integration Guide for Existing Apps

This section documents what EACH existing app must change to trust the COMS System's SSO. Include this in the repo as `docs/app-integration-guide.md`.

> **Path-based routing note**: Each app is deployed as its own Cloud Run service. A GCP HTTPS Load Balancer routes `coms.ahacommerce.net/<slug>/*` to the corresponding service. Each app must handle its base path (e.g., serve from `/heroes/` prefix). The session cookie is on the same domain, so no cross-domain concerns.

### 8.1 Universal Integration Pattern

Every app needs ONE middleware that:

1. Reads the `__session` cookie from the request
2. Verifies it against GIP using `firebase-admin`
3. Checks the `apps` custom claim includes this app's slug
4. JIT-provisions a local user if first visit
5. Attaches user info to request context

```typescript
// Example: Node.js / Express / Elysia / Hono / any framework
import { getAuth } from 'firebase-admin/auth'

export async function verifyPortalSession(cookieValue: string) {
  // 1. Verify the session cookie (checks signature, expiry, revocation)
  const decoded = await getAuth().verifySessionCookie(cookieValue, true)

  // 2. Extract custom claims
  const apps: string[] = decoded.apps ?? []
  const portalRole: string = decoded.portalRole ?? 'employee'
  const teamIds: string[] = decoded.teamIds ?? []

  return {
    gipUid: decoded.uid,
    email: decoded.email!,
    name: decoded.name ?? decoded.email!,
    portalRole,
    teamIds,
    apps,
  }
}
```

### 8.2 App A: coms_aha_heroes (TanStack Start + Elysia + BetterAuth)

**Current auth**: BetterAuth with Google OAuth + email/password

**Migration steps:**

1. **Add `gip_uid` column** to `users` table:
   ```sql
   ALTER TABLE users ADD COLUMN gip_uid TEXT UNIQUE;
   ```

2. **Add `firebase-admin` dependency**:
   ```bash
   bun add firebase-admin
   ```

3. **Initialize Firebase Admin** in `src/server/gip.ts`:
   ```typescript
   import { initializeApp, cert, getApps } from 'firebase-admin/app'

   export function initGip() {
     if (getApps().length === 0) {
       initializeApp({
         credential: cert({
           projectId: process.env.GIP_PROJECT_ID,
           // On Cloud Run, uses default service account — no key needed
         }),
       })
     }
   }
   ```

4. **Create dual-auth middleware** (`src/server/middleware/gip-auth.ts`):
   ```typescript
   import { getAuth } from 'firebase-admin/auth'
   import { db } from '~/db'
   import { users } from '~/db/schema/users'
   import { eq } from 'drizzle-orm'

   export async function resolveGipSession(cookie: string | undefined) {
     if (!cookie) return null

     try {
       const decoded = await getAuth().verifySessionCookie(cookie, true)
       const apps: string[] = decoded.apps ?? []
       if (!apps.includes('heroes')) return null

       // Find local user by gip_uid
       let localUser = await db.query.users.findFirst({
         where: eq(users.gipUid, decoded.uid),
       })

       if (!localUser) {
         // JIT provision: find by email (for migrated users) or create new
         localUser = await db.query.users.findFirst({
           where: eq(users.email, decoded.email!),
         })

         if (localUser) {
           // Link existing user to GIP
           await db.update(users)
             .set({ gipUid: decoded.uid })
             .where(eq(users.id, localUser.id))
         }
         // If no local user exists at all, the portal should have provisioned one.
         // Return null — user needs to be set up in heroes by an admin.
       }

       if (!localUser) return null

       return {
         id: localUser.id,
         email: localUser.email,
         name: localUser.name,
         role: localUser.role,
         branchId: localUser.branchId,
         teamId: localUser.teamId,
         canSubmitPoints: localUser.canSubmitPoints,
         mustChangePassword: false, // portal handles password
       }
     } catch {
       return null
     }
   }
   ```

5. **Update auth middleware** (`src/server/middleware/auth.ts`) to try GIP first, fall back to BetterAuth:
   ```typescript
   // In the auth plugin's derive function:
   // 1. Try GIP session cookie first
   const gipUser = await resolveGipSession(
     request.headers.get('cookie')?.match(/__session=([^;]+)/)?.[1]
   )
   if (gipUser) {
     return { authUser: gipUser }
   }

   // 2. Fall back to BetterAuth (existing logic)
   const session = await auth.api.getSession(/* ... */)
   // ... existing BetterAuth resolution ...
   ```

6. **Update frontend** (`src/routes/_authed.tsx`) to redirect to COMS login if no session:
   ```typescript
   // In beforeLoad, if getSessionFn returns null:
   throw redirect({
     to: 'https://coms.ahacommerce.net/login',
     search: { redirect: `https://coms.ahacommerce.net/heroes${location.pathname}` },
   })
   ```

7. **Configure base path** — app must serve under `/heroes/` prefix when behind the LB:
   ```typescript
   // app.config.ts — set base path for path-based routing
   export default defineConfig({
     server: { baseURL: '/heroes' },
   })
   ```

8. **Migration script** — link existing BetterAuth users to GIP:
   ```typescript
   // For each user in the heroes users table:
   // 1. Create GIP user: getAuth().createUser({ email, displayName, emailVerified: true })
   // 2. Update heroes users table: SET gip_uid = <newly created GIP uid>
   ```

**Phase 2 cleanup** (after all users migrated):
- Remove `src/server/auth.ts` (BetterAuth config)
- Remove `src/lib/auth-client.ts` (BetterAuth client)
- Remove `src/routes/login.tsx` (login page)
- Remove `src/db/schema/auth.ts` (BetterAuth tables: user, session, account, verification)
- Remove `src/server/services/auth-sync.ts`
- Remove `src/server/routes/auth.ts`
- Remove `better-auth` from `package.json`
- Remove BetterAuth fallback from auth middleware
- Drop BetterAuth tables from database (after backup)

### 8.3 Any Future App (Any Stack)

**Node.js/TypeScript**: Use `firebase-admin` SDK as shown above.

**Python**:
```python
from firebase_admin import auth
decoded = auth.verify_session_cookie(cookie, check_revoked=True)
apps = decoded.get('apps', [])
```

**Go**:
```go
client, _ := firebaseApp.Auth(ctx)
decoded, _ := client.VerifySessionCookie(ctx, cookie)
apps := decoded.Claims["apps"].([]interface{})
```

**Any language with JWT support**: Verify the cookie as a JWT using Google's public keys from `https://www.googleapis.com/identitytoolkit/v3/relyingparty/publicKeys`.

---

## 9. Employee Provisioning Flow

### Creating a New Employee (Admin UI)

```
Admin fills form:
  - Name: "Budi Santoso"
  - Email: "budi@gmail.com" (personal email)
  - Department: "Engineering"
  - Position: "Frontend Developer"
  - Team: "Engineering Team"

Portal backend:
  1. INSERT INTO identity_users (email, name, department, position, ...)
  2. getAuth().createUser({ email: "budi@gmail.com", displayName: "Budi Santoso" })
  3. UPDATE identity_users SET gip_uid = <new GIP uid>
  4. INSERT INTO team_members (team_id, user_id)
  5. Resolve app access from team membership
  6. setCustomUserClaims(gipUid, { apps: ["heroes", "fast"], ... })
  7. getAuth().generatePasswordResetLink("budi@gmail.com")
     → sends welcome email with password setup link

Employee receives email:
  "Welcome to Ahabot Portal. Click here to set your password."
  → Sets password → can login at coms.ahacommerce.net
```

### Bulk Import from Spreadsheet/CSV

```
Admin uploads CSV:
  name,email,department,position,team
  Budi Santoso,budi@gmail.com,Engineering,Frontend Developer,Engineering Team
  Ani Wijaya,ani@company.com,HR,HR Manager,HR Team
  ...

Portal backend (batch, 50 rows at a time):
  For each row:
    1. Upsert identity_users (on conflict email, do update)
    2. Create GIP user if gip_uid is null
    3. Assign to team
    4. Set custom claims
    5. Send welcome email (new users only)
```

---

## 10. Project Structure

```
coms-system/
├── src/
│   ├── routes/                       # TanStack Router file-based routes
│   │   ├── __root.tsx                # Root layout
│   │   ├── login.tsx                 # Public: login page
│   │   ├── forgot-password.tsx       # Public: password reset
│   │   ├── _authed.tsx               # Auth layout (session check, redirect if no cookie)
│   │   ├── _authed/
│   │   │   ├── index.tsx             # App launcher dashboard
│   │   │   ├── profile.tsx           # User profile
│   │   │   └── admin/
│   │   │       ├── employees.tsx     # Employee list
│   │   │       ├── employees.new.tsx # Add employee
│   │   │       ├── employees.$id.tsx # Employee detail
│   │   │       ├── teams.tsx         # Team list
│   │   │       ├── teams.new.tsx     # Create team
│   │   │       ├── teams.$id.tsx     # Team detail (members + app access)
│   │   │       ├── apps.tsx          # App registry
│   │   │       └── audit.tsx         # Audit log
│   │   └── api/
│   │       └── $.ts                  # Catch-all → Elysia handler
│   ├── server/                       # Backend (Elysia)
│   │   ├── index.ts                  # Elysia app instance
│   │   ├── gip.ts                    # firebase-admin init
│   │   ├── middleware/
│   │   │   ├── auth.ts               # Session cookie verification
│   │   │   └── rbac.ts               # Portal role guard
│   │   ├── routes/
│   │   │   ├── auth.ts               # POST /session, /logout, GET /me
│   │   │   ├── employees.ts          # CRUD employees + GIP provisioning
│   │   │   ├── teams.ts              # CRUD teams + member management
│   │   │   ├── apps.ts               # CRUD app registry
│   │   │   ├── access.ts             # Team ↔ app access grants
│   │   │   └── dashboard.ts          # User's accessible apps
│   │   ├── services/
│   │   │   ├── employees.ts          # Employee business logic
│   │   │   ├── teams.ts              # Team business logic
│   │   │   ├── apps.ts               # App registry logic
│   │   │   ├── claims.ts             # GIP custom claims resolution + sync
│   │   │   └── audit.ts              # Audit logging
│   │   └── repositories/
│   │       ├── employees.ts
│   │       ├── teams.ts
│   │       ├── apps.ts
│   │       └── audit.ts
│   ├── server/functions/              # TanStack Start server functions
│   │   └── auth.ts                    # getSessionFn (SSR session check)
│   ├── components/
│   │   ├── ui/                        # shadcn components
│   │   ├── app-card.tsx               # App launcher card
│   │   ├── employee-table.tsx
│   │   ├── team-form.tsx
│   │   └── sidebar.tsx
│   ├── lib/
│   │   ├── gip-client.ts             # firebase client init (browser)
│   │   ├── eden.ts                    # Eden Treaty client (type-safe API calls)
│   │   └── session.ts                # Cookie helpers
│   ├── db/
│   │   ├── index.ts                   # Drizzle client
│   │   ├── schema/
│   │   │   ├── identity-users.ts
│   │   │   ├── teams.ts
│   │   │   ├── apps.ts
│   │   │   ├── audit.ts
│   │   │   └── index.ts
│   │   └── migrations/
│   └── shared/
│       ├── constants/
│       │   └── roles.ts               # Portal role definitions
│       └── schemas/
│           ├── employees.ts           # Zod schemas for employee forms
│           └── teams.ts               # Zod schemas for team forms
├── docs/
│   └── app-integration-guide.md       # Guide for other app teams
├── infra/                             # OpenTofu (all resources prefixed coms-system-)
│   ├── main.tf
│   ├── variables.tf
│   └── modules/
│       ├── cloud-run/                 # coms-system-app service
│       └── load-balancer/             # coms-system-lb with path rules
├── drizzle.config.ts
├── app.config.ts                      # TanStack Start / Vinxi config
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── CLAUDE.md                          # Instructions for AI agents working on this repo
```

### Eden Treaty Setup

The portal uses Eden Treaty for type-safe frontend → Elysia API calls:

```typescript
// src/lib/eden.ts
import { treaty } from '@elysiajs/eden'
import type { App } from '~/server/index'

export const api = treaty<App>('', {
  // Empty string = same origin (no CORS needed)
  // Eden infers all routes and types from the Elysia App type
})

// Usage in components:
// const { data } = await api.api.v1.employees.get()
// const { data } = await api.api.v1.teams({ id }).get()
```

### API Catch-All Route

```typescript
// src/routes/api/$.ts — same pattern as heroes app
import { createAPIFileRoute } from '@tanstack/react-start/api'
import { app } from '~/server/index'

export const APIRoute = createAPIFileRoute('/api/$')({
  GET: ({ request }) => app.handle(request),
  POST: ({ request }) => app.handle(request),
  PUT: ({ request }) => app.handle(request),
  PATCH: ({ request }) => app.handle(request),
  DELETE: ({ request }) => app.handle(request),
})
```

---

## 11. Security Requirements

### Cookie Security

- `HttpOnly` — not accessible via JavaScript (XSS protection)
- `Secure` — HTTPS only
- `SameSite=Lax` — prevents CSRF on cross-origin POST
- No `Domain` attribute needed — cookie defaults to `coms.ahacommerce.net` (all apps are path-based on same host)
- 14-day expiry with server-side revocation support

### Access Control

- Only pre-provisioned employees can log in (closed registration)
- Team-based access: no team assignment = no app access
- Admin pages require `admin` portal role
- App registration requires `admin`
- All access changes logged to audit table

### GIP Security

- Session cookies verified with `checkRevoked: true` on every request
- Custom claims limited to <1KB (GIP hard limit)
- Password policy: minimum 8 characters (GIP enforced)
- Account lockout after 5 failed attempts (GIP default)

### Secrets

- No secrets in code or environment files
- All secrets via GCP Secret Manager
- Firebase Admin SDK uses Cloud Run default service account (no key file needed)

---

## 12. Seed Data

### Initial App Registry

```typescript
const SEED_APPS = [
  {
    slug: 'heroes',
    name: 'AHA Heroes',
    description: 'Employee recognition and points system',
    url: 'https://coms.ahacommerce.net/heroes',
    status: 'active',
  },
]
```

### Initial Admin

```typescript
// First user — the person setting this up (you)
const SEED_ADMIN = {
  email: '<your-email>',
  name: '<your-name>',
  portalRole: 'admin',
  status: 'active',
}
```

---

## 13. References

### Existing App: coms_aha_heroes

| Concern | File Path |
|---------|-----------|
| BetterAuth config | `src/server/auth.ts` |
| Auth middleware | `src/server/middleware/auth.ts` |
| RBAC middleware | `src/server/middleware/rbac.ts` |
| AuthUser type | `src/server/middleware/auth.ts` |
| Users schema | `src/db/schema/users.ts` |
| Teams schema | `src/db/schema/teams.ts` |
| Branches schema | `src/db/schema/branches.ts` |
| Role constants | `src/shared/constants/roles.ts` |
| BetterAuth schema | `src/db/schema/auth.ts` |
| Login page | `src/routes/login.tsx` |
| Auth client (browser) | `src/lib/auth-client.ts` |
| Auth server function | `src/server/functions/auth.ts` |
| Sheet sync service | `src/server/services/sheet-sync.ts` |
| OpenTofu infra | `infra/main.tf` (all resources prefixed `coms-system-`) |

### GCP Resources

| Resource | ID / Name |
|----------|-----------|
| GCP Project | `<your-gcp-project>` |
| Region | `asia-southeast2 (Jakarta)` |
| Cloud SQL instance | (check terraform output) |
| GitHub Org | `mrdoorba` |

### GIP Documentation

- Firebase Admin SDK Session Cookies: https://firebase.google.com/docs/auth/admin/manage-cookies
- Custom Claims: https://firebase.google.com/docs/auth/admin/custom-claims
- Identity Platform Docs: https://cloud.google.com/identity-platform/docs

### Framework Documentation

- TanStack Start: https://tanstack.com/start/latest
- TanStack Router (file-based routing): https://tanstack.com/router/latest
- Elysia: https://elysiajs.com
- Elysia + TanStack Start Integration: https://elysiajs.com/integrations/tanstack-start
- Eden Treaty (type-safe client): https://elysiajs.com/eden/treaty/overview
- Drizzle ORM: https://orm.drizzle.team
