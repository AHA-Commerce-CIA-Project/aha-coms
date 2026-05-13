# AHA FAST (Smart Tracker) — Project Context & Summary

> **Last updated:** 2026-03-31
> **Project path:** `c:\Users\user\Documents\Antigravity\PM\aha-smart-tracker`

---

## 1. Overview

**AHA FAST** (Factual Agile Smart Tracker) adalah internal project management & ticketing system milik **AHA Commerce**. Aplikasi ini dibangun untuk mengelola task-task lintas divisi, mengkoordinasi pekerjaan antar tim, dan menyediakan dashboard analitik bagi leadership.

### Key Objectives
- Menyediakan **Request Form** publik agar karyawan dari divisi manapun bisa mengajukan request/tiket kepada tim FAST
- **Kanban board** & **task management** untuk anggota tim FAST
- **Analytics dashboard** untuk leadership memonitor performa dan workload
- **Scheduling & meeting management** ter-integrasi dengan Google Calendar
- **Notifikasi** dan Slack integration
- **User management** dengan role-based access control (Leader vs Member)
- **Google Sheets integration** untuk sinkronisasi data karyawan HRD

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 16.1.4 (App Router) |
| **Language** | TypeScript |
| **UI** | React 19.2.3, Tailwind CSS v4, Lucide Icons |
| **State Management** | Zustand (client-side), React Context (auth) |
| **ORM / Database** | Prisma 5.21.1 → PostgreSQL (GCP Cloud SQL) |
| **Authentication** | Better Auth (email/password) |
| **File Storage** | Google Cloud Storage |
| **Integrations** | Google Calendar API, Google Sheets API, Slack Webhooks |
| **Drag & Drop** | @dnd-kit/core, @dnd-kit/sortable |
| **Validation** | Zod v4 |
| **Deployment** | Docker → GCP Cloud Run (Terraform-managed) |

---

## 3. Project Structure

```
aha-smart-tracker/
├── app/                        # Next.js App Router
│   ├── page.tsx                # Dashboard (home) — shows KPIs
│   ├── layout.tsx              # Root layout with AppShell
│   ├── globals.css             # Global styles + Tailwind
│   ├── login/page.tsx          # Login page
│   ├── register/page.tsx       # Registration page (@ahacommerce.net only)
│   ├── tasks/page.tsx          # My Tasks — personal task board + calendar
│   ├── nexus/page.tsx          # Task Queue — Kanban board for all incoming tasks
│   ├── request/page.tsx        # Public request form (submit tickets + book meetings)
│   ├── track/page.tsx          # Public ticket tracker (by token)
│   ├── complete/page.tsx       # Task completion form (difficulty, notes, time)
│   ├── analytics/page.tsx      # Analytics dashboard (Leader only)
│   ├── users/page.tsx          # User Control Panel (Leader only)
│   └── api/                    # API Routes
│       ├── admin/sync-hr/      # POST — Sync employee data from Google Sheets
│       ├── analytics/          # GET — Analytics data with date filters
│       ├── auth/               # Better Auth routes + Google OAuth callback
│       ├── dashboard/          # GET — Dashboard KPI data
│       ├── employees/          # GET — Public employee name list (from Google Sheets)
│       ├── google-calendar/    # GET — Fetch Google Calendar events
│       ├── meetings/           # CRUD meetings + Google Calendar sync
│       ├── nexus/              # GET — All tasks for Kanban board
│       ├── notifications/      # CRUD notifications
│       ├── profile/            # GET — Current user profile
│       ├── request/            # POST — Submit request, GET — list requests
│       ├── request-meeting/    # POST — Submit meeting request
│       ├── slack/              # Slack webhook integration
│       ├── tasks/              # CRUD tasks + completion + archiving + claiming
│       ├── teammates/          # GET — Teammates in same division
│       ├── teams/              # GET — All teams
│       ├── upload/             # POST — File upload to GCS
│       └── users/              # CRUD users (Leader only)
├── components/
│   ├── AppShell.tsx            # Main layout wrapper
│   ├── Providers.tsx           # Client-side provider wrappers
│   ├── layout/
│   │   ├── Sidebar.tsx         # Navigation sidebar with role-based items
│   │   └── Header.tsx          # Top navigation bar
│   ├── dashboard/
│   │   └── StatsCard.tsx       # Reusable KPI card component
│   └── tasks/
│       ├── TaskCard.tsx        # Task card for Kanban
│       └── TaskTable.tsx       # Task table view
├── lib/
│   ├── auth.ts                 # Better Auth configuration
│   ├── auth-client.ts          # Better Auth client SDK
│   ├── auth-context.tsx        # React context for auth state (isLeader, user info)
│   ├── auth-server.ts          # Server-side session helpers
│   ├── db.ts                   # Prisma client singleton
│   ├── google-calendar.ts      # Google Calendar API helpers (OAuth2, CRUD events)
│   ├── google-sheets.ts        # Google Sheets API helper (fetch HR employee data)
│   ├── notify-leaders.ts       # Notification helper for team leaders
│   ├── api-response.ts         # Standardized API error handler (withErrorHandler)
│   ├── store.ts                # Zustand global state store
│   ├── types.ts                # TypeScript type definitions
│   ├── utils.ts                # Utility functions (cn, etc.)
│   ├── validations.ts          # Zod validation schemas
│   └── mock-data.ts            # Mock data for initial development
├── prisma/
│   └── schema.prisma           # Database schema
├── scripts/                    # Utility scripts
│   ├── seed-teams.mjs          # Seed teams via Supabase
│   ├── reseed-teams.ts         # Reseed teams via Prisma
│   ├── add-teams.ts            # Add new teams to DB
│   ├── set-leader.ts           # Promote user to Leader role
│   ├── set-admin.ts            # Promote user to Admin role
│   ├── setup-meetings.mjs      # Setup meetings table (legacy)
│   ├── setup-storage.mjs       # Setup GCS bucket
│   └── fix-rls.mjs             # Fix Row Level Security policies
├── terraform/                  # GCP infrastructure as code
├── proxy.ts                    # Next.js proxy (auth redirect logic)
├── Dockerfile                  # Docker build config
└── package.json
```

---

## 4. Database Schema (Prisma)

### Models

#### `User`
- `id` (PK), `name`, `email` (unique), `emailVerified`, `image`
- `role`: `'leader'` | `'member'` (default: `'member'`)
- `teamId` → FK to `Team`
- Relations: `sessions`, `accounts`, `tasks`, `completedTasks`, `notifications`, `meetings`, `googleToken`

#### `Team`
- `id` (PK, UUID), `name` (varchar 255), `createdAt`
- Relations: `users`, `projects`
- **Current teams in DB:** FBI, PR, Marketplace, Branding, Finance, BD, Warehouse, HR, CS, Logistics

#### `Project`
- `id` (PK, UUID), `name`, `description`, `status` (active/on-hold/completed/archived)
- `deadline`, `color`, `teamId` → FK to `Team`
- `googleSheetSyncId` (optional)

#### `Task`
- `id` (PK, UUID), `title`, `description`
- `status`: `'todo'` | `'in-progress'` | `'review'` | `'done'` | `'pending_completion_details'`
- `priority`: `'low'` | `'medium'` | `'high'`
- **Ticketing fields:** `requesterName`, `requesterEmail`, `requesterDivision`, `urgency` (P1-P4, 5-minute), `attachments` (JSON), `customFields` (JSON)
- **Completion fields:** `completedBy`, `difficultyScore` (1-5), `feedbackNotes`, `actualTimeSpent`, `timeUnit`, `resolutionSummary`
- **Request fields:** `requestType`, `attachmentLink`, `impactDescription`, `relatedProjectName`, `meetingDateRange`, `meetingDuration`, `meetingPurpose`, `taskToken`
- `dueDate`, `projectId`, `assigneeId`, `notes`, `isRecurring`, `recurrenceType`
- `createdAt`, `completedAt`

#### `Meeting`
- `id`, `title`, `description`, `meetingDate`, `startTime`, `endTime`
- `createdBy` → FK User, `assignedTo` → FK User
- `source` (leader/member/partner_relations), `status` (confirmed/pending/cancelled)
- `notifyBefore`, `googleEventId`
- Relations: `guests` (MeetingGuest)

#### `Notification`
- `id`, `userId`, `type` (task_assigned/task_updated/reminder/mention), `title`, `message`, `read`, `data` (JSON)

#### `GoogleToken`
- Stores OAuth2 tokens per user for Google Calendar integration
- `accessToken`, `refreshToken`, `expiryDate`

#### Auth Models (Better Auth)
- `Session`, `Account`, `Verification`

---

## 5. Features & Pages

### 5.1 Dashboard (`/`)
- **KPI cards:** Completed tasks, Active tasks, Team members
- **Metrics:** Total tickets, Completion rate, Avg resolution time, Avg difficulty
- **Period filter:** This Day / This Week / This Month
- **Role:** Accessible by all authenticated users

### 5.2 My Tasks (`/tasks`)
- Personal task board + integrated calendar view
- Toggle between Kanban view and calendar
- Google Calendar sync (connect/disconnect)
- Meeting management (create, view, delete meetings)

### 5.3 Task Queue / Nexus (`/nexus`)
- Kanban board showing ALL incoming tasks/requests
- **Columns:** Queue (todo) → In Progress → Done
- Filter by division, urgency, assignee
- Drag & drop (via @dnd-kit) to change task status
- Task cards show requester name/division, urgency badge, assignee
- **Claim task** functionality for team members
- **Archive** and **Delete** tasks
- **Task completion workflow:** When marking done → modal asks for difficulty score, time spent, resolution summary

### 5.4 Request Form (`/request`) — PUBLIC
- **Two tabs:** Submit Request | Making Appointment
- **Submit Request form fields:**
  1. Division / Team / Brand (select, required first)
  2. Full Name (autocomplete from Google Sheets HR data, filtered by selected division)
  3. Request Type (Partner Request / Google Sheets Maintenance / Other)
  4. Title/Subject
  5. Priority Level (P1–P4, 5 Min)
  6. Description (rich text area)
  7. Due Date
  8. Attachment (image upload to GCS, clipboard paste, drag & drop)
- **Making Appointment tab:** Schedule meetings with date, time, duration, purpose
- Returns a **Task Token** for tracking

### 5.5 Track Request (`/track`) — PUBLIC
- Enter task token to check request status
- Shows current status, assignee, timeline

### 5.6 Analytics (`/analytics`) — LEADER ONLY
- **Filters:** Quick filter (Today/Week/30 days/All), By Date range, By Month, By Year
- **KPI cards:** Total tickets, Completion rate, Avg resolution time, Avg difficulty
- **Charts:** Tickets by urgency, Tickets by division, Task status breakdown
- **Top performers** leaderboard

### 5.7 User Control Panel (`/users`) — LEADER ONLY
- CRUD users (create with Better Auth signup)
- Assign roles (Leader/Member) and teams
- Confirm email, delete users
- **Sync HR Data** button — pulls employee data from Google Sheets, auto-creates teams, matches users by name and updates team assignments
- Search/filter users

### 5.8 Registration (`/register`)
- **Email restricted to `@ahacommerce.net` domain only**
- Client-side + server-side validation
- Full name, email, password, confirm password

---

## 6. Authentication & Authorization

- **Engine:** Better Auth with Prisma adapter
- **Strategy:** Email + Password
- **Session management:** 7-day expiry, 1-day update interval
- **Proxy middleware** (`proxy.ts`): Redirects unauthenticated users to `/login`, allows public routes (`/request`, `/track`, `/api/*`)
- **Roles:**
  - `leader` — Full access: analytics, user management, task oversight
  - `member` — Dashboard, personal tasks, nexus board, request form
- **Domain restriction:** Only `@ahacommerce.net` emails can register

---

## 7. Integrations

### 7.1 Google Calendar
- OAuth2 flow via `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
- Per-user token storage in `GoogleToken` table
- Auto-refresh tokens when expired
- Sync meetings to/from Google Calendar
- Calendar widget on Tasks page

### 7.2 Google Sheets (HR Data)
- Reads employee data (Name, Team) from HR spreadsheet
- `HR_SPREADSHEET_ID` + `HR_SHEET_NAME` env variables
- `/api/employees` — public API (cached 5 min) for autocomplete on request form
- `/api/admin/sync-hr` — admin endpoint to sync teams & users
- Uses OAuth2 tokens from connected Google Calendar user or `GOOGLE_API_KEY`

### 7.3 Slack
- Webhook notifications on new task requests
- Interactive messages for task actions
- `SLACK_WEBHOOK_URL` env variable

### 7.4 Google Cloud Storage
- File upload for task attachments
- Bucket: `aha-fast-*`
- Upload via `/api/upload` with clipboard paste and drag & drop support

---

## 8. Environment Variables

```env
# Supabase (legacy, still used for some storage)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Database
DATABASE_URL=               # PostgreSQL connection string (GCP Cloud SQL)

# Auth
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Google APIs
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
GOOGLE_CALENDAR_ID=

# Google Sheets HR Integration
HR_SPREADSHEET_ID=          # Google Sheet with employee data (columns: Nama Lengkap, Tim)
HR_SHEET_NAME=Sheet1        # Tab name in the spreadsheet

# Slack
SLACK_WEBHOOK_URL=
```

---

## 9. Key Design Patterns

1. **API Routes** use either raw `export async function` or a `withErrorHandler` wrapper from `lib/api-response.ts` for standardized error handling.
2. **Auth verification** in API routes via `requireAuth()` from `lib/auth-server.ts`.
3. **Leader-only routes** verify `user.role === 'leader'` after auth.
4. **Public routes** (request form, track, employees API) have no auth requirement.
5. **Frontend state:** Zustand store for UI state + `useAuth()` context for session info.
6. **Styling:** Tailwind CSS v4 with consistent design tokens — indigo/purple primary palette, slate neutrals, white card backgrounds with `rounded-2xl` and `shadow-sm` patterns.
7. **Prisma schema** maps table names to lowercase (e.g., `@@map("tasks")`), column names to snake_case.

---

## 10. Divisions / Teams

Current divisions available in the application:

| Division | Sheet Name(s) |
|---|---|
| Factual Business Intelligence (FBI) | FBI |
| Partner Relationship (PR) | Partnership |
| Marketplace (MP) | Marketplace |
| Branding | Branding |
| Finance | Finance |
| Business Development (BD) | BD, Business Development |
| Warehouse | Warehouse |
| Human Resource (HR) | HRD, HR |
| Customer Service (CS) | CS |
| Logistics | Logistics |
| Executives | Executives |
| Leadership | Leadership |

---

## 11. Scripts

| Script | Purpose |
|---|---|
| `npx tsx scripts/add-teams.ts` | Add new teams to DB |
| `npx tsx scripts/reseed-teams.ts` | Reset and reseed all teams |
| `npx tsx scripts/set-leader.ts` | Promote a user to Leader role |
| `npx tsx scripts/set-admin.ts` | Promote a user to Admin role |
| `node scripts/seed-teams.mjs` | Seed teams via Supabase |
| `node scripts/fix-rls.mjs` | Fix Row Level Security policies |
| `node scripts/setup-meetings.mjs` | Setup meetings table |
| `node scripts/setup-storage.mjs` | Setup GCS bucket |

---

## 12. Running the Project

```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Run development server
npm run dev

# Build for production
npm run build

# Docker build
docker build -t aha-fast .
```

---

## 13. Deployment

- **Platform:** GCP Cloud Run (via Terraform)
- **Build:** Docker multi-stage build (Node.js 20)
- **Database:** GCP Cloud SQL (PostgreSQL)
- **Storage:** GCP Cloud Storage
- **Output mode:** `standalone` (Next.js)
