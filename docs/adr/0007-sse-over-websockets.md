# ADR 0007: Server-Sent Events for real-time, no public WebSockets

Status: accepted (2026-05-11)

## Context

aha-fast is a project management tool that includes a chat/channel feature with a mature data model (DMs, channels, threads, reactions, read status — all Postgres-backed via Prisma). Future apps may also want real-time features (live dashboards, presence, notifications).

The ingress layer (ADR 0004, Firebase Hosting) does NOT support WebSocket upgrades through its `rewrites` to Cloud Run. A WS connection to an app's public Cloud Run URL behind Firebase Hosting fails. This is a hard constraint, not a tuning knob.

Real-time options that respect the constraint:

1. **Server-Sent Events (SSE)** through Firebase Hosting → Cloud Run. Just HTTP, no upgrade. `EventSource` in browsers handles reconnection natively. Sufficient for the chat use case.
2. **Long polling.** Older pattern, works through any proxy, but burns more requests.
3. **Firestore real-time listeners.** Bypass our infrastructure entirely; Firestore SDK talks to Firestore directly.
4. **Direct Cloud Run URL for WebSocket** (bypass Firebase Hosting for the WS endpoint).
5. **Switch fronting to Cloud Load Balancer** (supports WS) — pays the LB cost ADR 0004 deferred.

For aha-fast specifically: the chat data model is already substantial in Postgres. The chat is one feature of a broader PM tool — list views, kanban, analytics, meetings, notifications, etc., all live in the same Postgres schema with cross-table relationships. Moving chat to Firestore would orphan that integration.

## Decision

All public real-time features in the COMS suite use Server-Sent Events for server-to-client streams, with ordinary HTTP POST for client-to-server messages. Cross-instance fanout on Cloud Run uses Postgres `LISTEN/NOTIFY` for Postgres-backed apps.

**No app exposes a public WebSocket endpoint.** Apps may use WebSockets internally (service-to-service within Cloud Run) but never on the public ingress.

For aha-fast chat specifically: SSE stream per active chat session; client POSTs new messages; server writes to Postgres, then `NOTIFY` on a channel. All Cloud Run instances `LISTEN` on the same channel and fan out received notifications to their connected SSE subscribers.

## Consequences

**Positive.**

- Works through Firebase Hosting cleanly. No infrastructure change required.
- `EventSource` is built into browsers and handles auto-reconnection. Client code is simpler than WS clients.
- Same authentication path as any other authed request — the cookie is sent on the GET, the server verifies the JWT via SDK.
- LISTEN/NOTIFY is lightweight: no Redis, no external pub/sub broker. Works at our scale.
- HTTP/2 multiplexes the long-lived GET with other requests over the same connection.

**Negative.**

- Half-duplex (two connections in flight): a long-lived SSE GET, plus short-lived POSTs for client → server. Architecturally fine but a different mental model than full-duplex WS.
- **Firebase Hosting's 60-second request timeout** cuts SSE streams every ~50-60 seconds. `EventSource` auto-reconnects, transparently to users, but each reconnect generates a Cloud Run request. At thousands of concurrent SSE subscribers, this becomes a real load (one reconnect per user per minute).
- LISTEN/NOTIFY has an 8KB payload limit. For larger payloads, `NOTIFY` carries an event ID and subscribers fetch the row.
- LISTEN/NOTIFY can drop notifications if a subscriber is slow (Postgres queue overflow). Mitigation: subscribers periodically poll for the latest state as a safety net.
- A Cloud Run instance receiving a NOTIFY must broadcast it to its connected SSE subscribers — requires an in-process subscriber registry. Standard pattern, but every chat-shipping app has to implement it.

**Neutral.**

- Heartbeat pings (every 30 seconds) keep the connection alive within the 60-second window and let the client detect dead connections faster than 60s.
- Server is responsible for cleaning up subscriber registry on connection close (browser tab close, network drop).

## Alternatives considered

**WebSockets via direct Cloud Run URL** (bypass Firebase Hosting for that endpoint). Possible — Cloud Run supports WS. But:

- Breaks the single-origin guarantee (ADR 0003) for that endpoint. The SW would need explicit handling for the bypass.
- Auth state crosses origins (cookies don't span subdomains by default), creating the same `portal_code` exchange problem the single-origin model eliminates.
- Operationally messier. Rejected for "use SSE everywhere" simplicity.

**Switch fronting to Cloud Load Balancer for WebSocket support.** Pays the LB cost ADR 0004 deferred ($18-30/month baseline). Defensible if a use case emerges that SSE genuinely cannot satisfy. Not justified by chat alone — chat works fine over SSE.

**Firestore real-time listeners for chat.** Bypass the WS-vs-Firebase-Hosting tension entirely (Firestore SDK talks directly to Firestore endpoints). Auth integration with GIP is native. Offline-first sync, FCM push, all free.

Rejected for aha-fast specifically because:

- aha-fast's chat data model is mature in Postgres (DMs, channels, threads, reactions, read status), with relationships to other aha-fast tables (users, teams, tasks).
- Migrating to Firestore would orphan that integration; chat would need to JOIN-equivalent against Postgres for context.
- The chat is one feature of a PM tool, not the product.

For *future* apps where chat is the primary domain and the data model is greenfield, Firestore remains worth considering and would warrant its own ADR.

**Long polling.** Works through Firebase Hosting, no client library required. But generates more requests, more bandwidth, more battery drain on mobile, and is generally outclassed by SSE for the same use cases. No advantage at our scale.

## Re-evaluation triggers

Revisit if any of:

- A use case requires binary protocols, very high message rates, or sub-100ms bidirectional latency that SSE provably cannot deliver.
- Concurrent SSE subscriber count per app exceeds ~1000 sustained, where reconnect overhead becomes a real cost driver.
- A future app's domain (real-time collaborative editing, video calls) needs the full WS feature set.

## References

- Integration contract § 6.
- ADR 0004 (Firebase Hosting routing) — the constraint that forces this choice.
- aha-fast's Prisma schema — shows the chat data model that informs the SSE-on-Postgres path.
