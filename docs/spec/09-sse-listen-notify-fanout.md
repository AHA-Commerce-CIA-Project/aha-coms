# Spec 09: SSE LISTEN/NOTIFY Fanout

> Status: **draft 2026-05-20** — design captured, no code landed.
> Type: one-shot (executable plan; document dies once executed).
> Owner: TBD
> Prerequisites: Spec 07 Phase B (DB perf baseline must be sane before we measure this spec's win); independent of Spec 08 — both can land in parallel.
> Targets: ADR 0007 (SSE over WebSockets) — the unimplemented LISTEN/NOTIFY half of the decision; integration contract § 6 (real-time); also closes a class of findings the DB Perf Audit doesn't formally flag (per-stream polling) by removing the queries entirely.

## Objective

Deliver ADR 0007's promise. Replace fast's three per-instance polling SSE streams (`/api/channels/stream`, `/api/chat/stream`, `/api/notifications/stream`) with Postgres `LISTEN/NOTIFY`-driven event fanout, so:

- A message written via Cloud Run instance A reaches SSE clients connected to instance B.
- Per-client per-second DB queries against `ChannelMessage`, `DirectMessage`, `Notification`, `Channel`, `ChannelReadStatus`, and `conversation_participants` drop to zero in the steady state.
- Cloud Run `session_affinity=true` (currently masking the bug per `apps/fast/CLAUDE.md`) becomes unnecessary and is disabled.

## Why this exists — ADR 0007's unimplemented half

ADR 0007 § Decision:

> "All public real-time features in the COMS suite use Server-Sent Events for server-to-client streams, with ordinary HTTP POST for client-to-server messages. Cross-instance fanout on Cloud Run uses Postgres `LISTEN/NOTIFY` for Postgres-backed apps."
>
> "All Cloud Run instances `LISTEN` on the same channel and fan out received notifications to their connected SSE subscribers."

The SSE half landed when fast onboarded (the three `text/event-stream` routes exist). The LISTEN/NOTIFY half did not. Today's implementation:

| Route | Line | Strategy | Tables polled |
|---|---|---|---|
| `app/api/channels/stream/route.ts` | `:99` | `setInterval(check, 2000)` | `channelMessage`, `channelReadStatus`, `channel` |
| `app/api/chat/stream/route.ts` | `:72` | `setInterval(check, 2000)` | `directMessage`, `conversation_participants` (raw SQL unread aggregate) |
| `app/api/notifications/stream/route.ts` | `:66` | `setInterval(tick, 1000)` | `notification` |

Each connected client = 30-60 DB queries per minute, per instance. Cross-instance fanout doesn't actually work: writes on instance A only reach SSE clients also bound to instance A. The current mitigation (`session_affinity=true` on `coms-fast-web` Cloud Run, per `apps/fast/CLAUDE.md`'s "Cloud Run shape" section) glues each browser session to one instance so reads-via-poll see writes-from-same-instance — that's a workaround, not the design ADR 0007 documents.

## Current state

- **Three polling routes** with the line numbers above. Each opens a `setInterval`; cleanup via `request.signal.addEventListener('abort', …)` (correctly wired post FU-25's "Fix SSE channel leak" commit).
- **Cloud Run** `coms-fast-web` runs with `session_affinity=true`, `min=0`, `max=5`. At max scale + N connected clients = N × 30-60 polling queries/minute on top of the Spec 08 session-validation reads.
- **Prisma's connection pool** doesn't keep LISTEN connections alive (each query checks a fresh conn out of the pool). LISTEN requires a dedicated long-lived `pg` connection outside Prisma.
- **db-f1-micro** has a 25-connection ceiling (per `apps/fast/CLAUDE.md` 2026-05-18 connection audit). One LISTEN connection per warm instance = max 5 connections in the steady state; tolerable.

## Success criteria

- [ ] `pg_notify` fires from every write path that today's three SSE polls would observe:
  - Channel message create: `pg_notify('fast_channel_msg', json with {channelId, messageId})`
  - DM create: `pg_notify('fast_dm', json with {conversationId, messageId})`
  - Channel read-status update: `pg_notify('fast_channel_read', json with {userId, channelId})`
  - Notification create: `pg_notify('fast_notif', json with {userId, notificationId})`
- [ ] Each `coms-fast-web` instance opens **one** dedicated `pg` LISTEN connection at boot, subscribes to all four channels, holds it for the instance's lifetime, closes it on graceful shutdown.
- [ ] An in-process subscriber registry routes incoming NOTIFY payloads to the right `ReadableStream` controllers — keyed by `userId` (notifications), `channelId` (channels), `conversationId` (DMs).
- [ ] `/api/channels/stream`, `/api/chat/stream`, `/api/notifications/stream` register their controller with the registry on connect; deregister on `request.signal.abort`; no `setInterval` polling in the steady state.
- [ ] **Safety-net polling** (per ADR 0007 §44 — *"LISTEN/NOTIFY can drop notifications if a subscriber is slow"*) runs at 60-second intervals as a backstop — catches any NOTIFY the registry dropped (Postgres queue overflow, instance momentarily disconnected). Not 1-2s; 60s is the belt-and-suspenders, not the primary fanout path.
- [ ] Heartbeat pings every 25-30s (per ADR 0007 §49) keep Firebase Hosting's 60-second timeout from closing idle streams.
- [ ] `payload size > 8KB`: NOTIFY payload is just the event ID; the SSE handler does a single targeted SELECT to fetch the row by id (per ADR 0007 §43 — *"For larger payloads, `NOTIFY` carries an event ID and subscribers fetch the row"*).
- [ ] Cloud Run `session_affinity=true` flipped to `false` in `infra/fast/cloud-run.tf`; smoke test confirms a message written via instance A reaches an SSE client on instance B.
- [ ] Steady-state DB query count on the three polled tables drops by ~95% (measured via `pg_stat_statements` before/after — 60s safety net poll ≠ 1000ms primary poll).
- [ ] ADR 0007 implementation-record amendment recording the resolution.

## Out of scope

- **Heroes' notifications** — heroes is not chat-shipping (no SSE streams). When heroes adopts SSE later, mirror this spec's shape; not this spec's work.
- **Portal-web's notification stream** — portal-web doesn't yet stream notifications. When it adopts SSE, mirror this spec's shape.
- **Redis or external pub/sub** — ADR 0007's stance ("LISTEN/NOTIFY is lightweight: no Redis, no external pub/sub broker. Works at our scale.") holds. If concurrent subscribers exceed ~1000 sustained (ADR 0007 §79 re-evaluation trigger), revisit then; not now.
- **Per-instance connection pooling for LISTEN** — one LISTEN connection per instance is sufficient; multiple wouldn't add capacity.
- **Re-syncing missed events during reconnect** — the 60s safety-net poll catches drops. A separate "last-event-id" replay protocol is a future enhancement; SSE's `EventSource` `lastEventId` machinery is unused in v1.
- **WebSocket fallback** — ADR 0007 forbids; not in scope.

## Phases

### Phase 1: NOTIFY plumbing — write paths

Acceptance: every relevant write fires NOTIFY; no consumer yet (NOTIFY without a listener is a no-op).

- [ ] **G.1: Fire NOTIFY from channel message writes.**
  - File: `apps/fast/app/api/channels/[id]/messages/route.ts` (or wherever channel message creation actually lives — verify at implementation time)
  - Action: after the Prisma `channelMessage.create({...})` returns, call `await prisma.$executeRaw\`SELECT pg_notify('fast_channel_msg', ${JSON.stringify({channelId, messageId: created.id, senderId})})\`` (or via the dedicated `pg` connection if Prisma's `$executeRaw` adds overhead — measure)
  - Acceptance: write path test confirms NOTIFY fires with the expected payload shape (use `pg`'s `client.query('LISTEN fast_channel_msg')` in the test setup)
  - Persona: plain technical English commit per `apps/fast/CLAUDE.md`; `[skip-db-push]` first line (no schema change)

- [ ] **G.2: Fire NOTIFY from DM writes.**
  - File: `apps/fast/app/api/chat/conversations/[id]/messages/route.ts`
  - Action: mirror G.1's pattern with channel `fast_dm`; payload `{conversationId, messageId, senderId}`
  - Acceptance: write path test confirms NOTIFY fires
  - Persona: plain technical English commit; `[skip-db-push]`

- [ ] **G.3: Fire NOTIFY from notification creates.**
  - File: `apps/fast/lib/notifications.ts` (or the central creator) + any direct callsites
  - Action: NOTIFY channel `fast_notif`; payload `{userId, notificationId}`
  - Acceptance: notification-create test confirms NOTIFY fires
  - Persona: plain technical English commit; `[skip-db-push]`

- [ ] **G.4: Fire NOTIFY from channel read-status updates.**
  - File: the `channelReadStatus` upsert callsite(s)
  - Action: NOTIFY channel `fast_channel_read`; payload `{userId, channelId}`
  - Acceptance: read-status-update test confirms NOTIFY fires
  - Persona: plain technical English commit; `[skip-db-push]`

### Phase 2: LISTEN infrastructure — subscriber registry

Acceptance: each Cloud Run instance opens one LISTEN connection, exposes a typed in-process subscriber registry.

- [ ] **G.5: Author the LISTEN connection + subscriber registry.**
  - File: `apps/fast/lib/realtime/subscriber-registry.ts` (new)
  - Dependencies: `pg` (or `node-postgres`) — Prisma can't model LISTEN. Verify whether `pg` is already a transitive dep via Prisma; if so, declare it explicitly; if not, add it (one package, no native build).
  - Shape:
    ```ts
    type ChannelKey = 'fast_channel_msg' | 'fast_dm' | 'fast_notif' | 'fast_channel_read';
    type Subscriber = { id: string; userId: string; key: ChannelKey; filter: Record<string, string>; send: (payload: unknown) => void };
    export function registerSubscriber(s: Subscriber): () => void;  // returns deregister fn
    export function startListener(): Promise<void>;  // module-init; opens pg connection, subscribes to all 4 channels
    ```
  - On boot (Next.js instrumentation hook or module-init pattern — verify the right place), call `startListener()`. The connection LISTENs to all four channels; incoming NOTIFY messages are routed to all subscribers whose `filter` matches the payload (e.g., `{channelId: 'abc'}` matches subscribers with `filter.channelId === 'abc'`).
  - On `process.on('SIGTERM', …)` (Cloud Run graceful shutdown), close the connection cleanly.
  - Acceptance: unit tests cover register/deregister; integration test fires a NOTIFY via a second `pg` connection and asserts the registered subscriber's `send` got called with the right payload.
  - Persona: plain technical English commit; `[skip-db-push]`

### Phase 3: SSE route cutover

Acceptance: each of the three SSE routes uses the registry instead of polling. The 60s safety-net poll survives as belt-and-suspenders.

- [ ] **G.6: Cut `/api/channels/stream` over to LISTEN-driven.**
  - File: `apps/fast/app/api/channels/stream/route.ts`
  - Action: replace the `setInterval(check, 2000)` block with two `registerSubscriber` calls — one for `fast_channel_msg` filtered on `channelId`, one for `fast_channel_read` filtered on `userId` (for unread-count updates). On NOTIFY receipt, do a single targeted Prisma `findUnique` or `findMany({ where: { id: { in: [messageId] }}})` to fetch the row (per ADR 0007 §43), then `send('messages', [row])`. Unread-count updates: same — fetch fresh aggregate, send `'unread'` event.
  - **Safety-net poll**: a `setInterval(safetyPoll, 60_000)` that does what the old 2s poll did. Catches dropped NOTIFYs.
  - On `request.signal.abort`, call the deregister fn returned by `registerSubscriber` + clear the safety-net interval.
  - Acceptance: integration test opens an EventSource against the route, writes a channel message via a second test process, asserts the `messages` event arrives within ≤500ms (latency budget for NOTIFY + registry + fetch); also asserts the 60s safety-net is wired (mock the registry to drop a NOTIFY, assert the safety poll catches it)
  - Persona: plain technical English commit; `[skip-db-push]`

- [ ] **G.7: Cut `/api/chat/stream` over to LISTEN-driven.**
  - File: `apps/fast/app/api/chat/stream/route.ts`
  - Action: mirror G.6's pattern with `fast_dm` filtered on `conversationId`. The raw-SQL conversation-unread aggregate can refresh on NOTIFY receipt (lazy) or via the 60s safety net (cheaper).
  - **Safety-net poll**: 60s; preserves the raw `$queryRaw` unread aggregate as the backstop.
  - Acceptance: integration test parallel to G.6
  - Persona: plain technical English commit; `[skip-db-push]`

- [ ] **G.8: Cut `/api/notifications/stream` over to LISTEN-driven.**
  - File: `apps/fast/app/api/notifications/stream/route.ts`
  - Action: mirror G.6's pattern with `fast_notif` filtered on `userId`. The 1000ms tick disappears. The 25000ms heartbeat survives (ADR 0007 §49 — keeps proxies/browsers from closing idle connections).
  - **Safety-net poll**: 60s.
  - Acceptance: integration test parallel to G.6
  - Persona: plain technical English commit; `[skip-db-push]`

### Phase 4: Cross-instance verification + session-affinity removal

Acceptance: messages cross instances; session affinity disabled.

- [ ] **G.9: Cross-instance smoke verification.**
  - With `session_affinity=true` still on, manually scale `coms-fast-web` `max=2` and warm two instances (via two concurrent requests with `Cache-Control: no-cache` to defeat affinity for the warmup). Open SSE client against instance A; write a message via instance B (force via a separate browser session that pins to instance B). Confirm the SSE client receives the event.
  - Acceptance: operator smoke confirms cross-instance fanout works under current session-affinity setting
  - Persona: plain technical English commit (this PR contains only an operator-window note in the commit body if no code changes; or a smoke-checklist file if one needs to be authored — `apps/fast/docs/sse-fanout-smoke.md`)

- [ ] **G.10: Disable Cloud Run session affinity.**
  - File: `infra/fast/cloud-run.tf` — flip `session_affinity = true` → `session_affinity = false` on the `coms-fast-web` service.
  - Operator step: `tofu apply` in `infra/fast/` (laptop CLI).
  - Acceptance: post-apply, repeat G.9's smoke test under `session_affinity=false`; confirm cross-instance fanout still works (the original problem the affinity was masking is now solved upstream).
  - **`apps/fast/CLAUDE.md` update**: the "Cloud Run shape" section's `session_affinity=true` line and the SSE rationale that justified it both need rewriting to reflect Spec 09's landing. Same commit.
  - Persona: Mr. Door for the infra/IaC commit (operator's territory); plain technical English for the `apps/fast/CLAUDE.md` edit (fast doc)

### Phase 5: Steady-state observation + ADR amendment

Acceptance: query-count drop observed; ADR records the implementation.

- [ ] **G.11: Steady-state DB query observation.**
  - Operator step: capture `pg_stat_statements` snapshot 24h pre-G.10 and 24h post-G.10. Confirm: query count for `ChannelMessage`/`DirectMessage`/`Notification`/`Channel`/`ChannelReadStatus` SELECTs from the SSE routes drops ~95%.
  - Acceptance: snapshot captured + included in PR body; ad-hoc query confirms drop
  - Persona: operator-led; commit either Mr. Door (if doc-only) or skipped (if just monitoring)

- [ ] **G.12: ADR 0007 amendment.**
  - File: `docs/adr/0007-sse-over-websockets.md`
  - Acceptance: dated addendum: "Implementation completed via Spec 09. The LISTEN/NOTIFY fanout fast was missing landed across G.1–G.10. `session_affinity` flipped to `false` post-implementation. Subscriber registry lives at `apps/fast/lib/realtime/subscriber-registry.ts`. Safety-net polling at 60s is the belt-and-suspenders against Postgres queue overflow per the original ADR's §44."
  - Persona: Mr. Door

## Risks worth tracking

- **Prisma + LISTEN/NOTIFY connection-pool mismatch.** Prisma checks connections out of a pool per query; you can't `LISTEN` on a borrowed connection because the LISTEN dies when the connection returns to the pool. The dedicated `pg` connection (G.5) is the canonical workaround. Risk = forgetting and using Prisma's `$executeRaw('LISTEN …')` which silently does nothing useful. Mitigation: G.5's tests fire NOTIFY from a second connection and assert the dedicated listener receives.
- **NOTIFY 8KB payload limit.** Channel message bodies can be larger. Hence the event-id-then-fetch pattern (per ADR 0007 §43). Risk = forgetting and stuffing the message body into the NOTIFY payload; works for short messages, breaks silently for long ones. Mitigation: NOTIFY payload schema is enforced as `{[entityIdField]: string, …minimal metadata}` only; a typecheck in `subscriber-registry.ts` rejects oversized payloads at runtime.
- **Postgres NOTIFY queue overflow.** If a subscriber is slow, Postgres drops the NOTIFY. ADR 0007 §44 calls this out. The 60s safety-net poll is the documented backstop. Risk = misinterpreting safety-net as primary path and tuning its interval down to ~5s, defeating the perf win. Mitigation: comment block at each safety-net `setInterval` callsite explicitly names it as the backstop with the 60s rationale.
- **Cloud Run instance startup ordering.** If a NOTIFY fires before instance B's LISTEN is established (instance just started, registry not yet listening), the event is missed. Cold-start window ≈ 50-200ms per `apps/fast/CLAUDE.md`. The safety-net poll catches this in ≤60s. Acceptable.
- **Connection budget on db-f1-micro.** Each warm instance holds one LISTEN connection. At `max=5`, that's 5 connections sitting open. The 2026-05-18 audit dropped `min` from 1 → 0 to reclaim 1-3 idle Prisma conns; this spec gives back 1 per warm instance. Net: still under the 25-conn ceiling, but worth monitoring during the cutover.
- **Graceful shutdown discipline.** Cloud Run sends SIGTERM with ~10s grace before SIGKILL. The dedicated `pg` connection must close cleanly so Postgres reclaims the slot. Risk = leaked connections accumulate against the 25-conn ceiling. Mitigation: G.5's `startListener()` registers a SIGTERM handler.
- **Coupling with Spec 08's revocation list.** Spec 08 introduces a revocation cache. If a user's session is revoked mid-SSE-stream, the stream should close. Today's polling routes effectively re-auth on every tick (the auth call runs once at connect time, then no re-validation). Spec 09's LISTEN-driven design has the same property — auth runs at connect time, then the stream persists until disconnect. **Decision deferred to implementation**: either accept the auth-at-connect-only model (matches today's behaviour) or add a per-NOTIFY revocation check via Spec 08's `sdk.auth.isSubRevoked`. Recommend the latter for sensitive surfaces (admin streams if any) but document the choice in the implementation PR.

## What's deliberately not in this plan

- **A second-app cutover** (e.g., heroes or portal-web adopting SSE). Both are PRs/specs of their own when their domains require it.
- **`LISTEN`-based replacement for Cloud Tasks webhook delivery.** Different problem space; Cloud Tasks handles its own retry semantics that LISTEN/NOTIFY can't replicate.
- **Event log / event sourcing semantics.** NOTIFY is fire-and-forget; this spec doesn't add an append-only event log. If durable replay is ever needed, see "Re-syncing missed events during reconnect" in §Out of scope.
- **Sub-500ms latency tuning.** The NOTIFY → registry → fetch → SSE send chain budgets ~500ms. If a future use case needs <100ms (collaborative editing, presence), ADR 0007's re-evaluation triggers apply.

## Confidence in the plan

**Medium-high.** The pattern (LISTEN connection + in-process subscriber registry + safety-net poll) is well-documented; ADR 0007 spells out the constraints (8KB payload limit, queue overflow handling, heartbeat interval). The risky parts are (a) Cloud Run's instance lifecycle interacting with the long-lived LISTEN connection — but graceful-shutdown handling is a standard pattern, and (b) the connection-budget impact on db-f1-micro — but at max=5, we sit at 20% of the ceiling. Migration discipline mirrors Spec 08's dual-path safety net: ship NOTIFY firings first (zero impact since nobody listens), then add LISTEN per-instance, then swap routes. Either deploy order is safe.

## References

- ADR 0007 — the original decision this spec implements
- `apps/fast/app/api/channels/stream/route.ts:99` — current polling shape
- `apps/fast/app/api/chat/stream/route.ts:72` — current polling shape
- `apps/fast/app/api/notifications/stream/route.ts:66` — current polling shape
- `apps/fast/CLAUDE.md` — `session_affinity=true` rationale (to be revised under G.10)
- Spec 08 (JWT stateless sessions) — sibling perf-direction spec; independent of this one
- Spec 07 (DB perf remediation) — provides the baseline against which this spec's win is measured
- Integration contract § 6 (real-time)
- Postgres docs: `LISTEN`, `NOTIFY`, `pg_notify(channel, payload)` — payload max 8000 bytes per the source
