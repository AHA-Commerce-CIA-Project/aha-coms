# ADR 0004: Firebase Hosting as the URL routing layer

Status: accepted (2026-05-11)

## Context

ADR 0003 establishes single-origin architecture: `coms.com` hosts everything, with URL paths routed to per-app Cloud Run services. That requires a reverse proxy / routing layer.

The COMS suite is GCP-hosted, uses Google Identity Platform (the Firebase Auth business tier), and operates at small scale today (single-digit concurrent active users projected to grow). Cost is a real constraint — the user explicitly stated load-balancer pricing is currently out of budget.

Options for the routing layer:

1. **Cloud Load Balancer with URL maps.** GCP-recommended for production. Static anycast IP, native HTTPS, IAP integration. ~$18-30/month baseline before any traffic.
2. **Firebase Hosting with rewrites.** A managed config-only routing service. Free for first 10 GB/month, $0.026/GB beyond.
3. **Custom Cloud Run routing service.** Pay-per-request, scales to zero, full control. Operational ownership of one more service.

Cost-effectiveness, ecosystem fit, and operational simplicity all point in the same direction at our stage. The trade-off is feature breadth: Load Balancer offers WAF, IAP, fine-grained CDN, custom routing logic; Firebase Hosting offers basic path-based rewrites with the routing rules in `firebase.json`.

## Decision

Use Firebase Hosting as the routing layer. `firebase.json` defines `rewrites` that map URL paths to per-app Cloud Run services:

```jsonc
{
  "hosting": {
    "public": "apps/portal-web/build",   // portal-web's static assets
    "rewrites": [
      { "source": "/heroes/**", "run": { "serviceId": "heroes-web", "region": "asia-southeast2" } },
      { "source": "/fast/**", "run": { "serviceId": "fast", "region": "asia-southeast2" } },
      { "source": "/api/**", "run": { "serviceId": "portal-api", "region": "asia-southeast2" } },
      { "source": "**", "run": { "serviceId": "portal-web", "region": "asia-southeast2" } }
    ]
  }
}
```

Cloud Run services keep their own URLs internally; the production-facing URL is always `coms.com/<path>`. Custom domain setup is deferred until after heroes and fast are integrated; until then, the Firebase-provided URL (`<project-id>.web.app`) is used.

## Consequences

**Positive.**

- Zero infrastructure to write or maintain. The routing layer is a config file.
- Free at our scale. 10 GB/month outbound free tier covers projected traffic for the foreseeable future.
- Native HTTPS, automatic certificate management (Let's Encrypt).
- Global CDN edge — static assets served from the nearest POP for free.
- GCP-native; fits the existing GIP/Firebase ecosystem.
- Custom domain setup later is a DNS change plus Firebase Hosting domain verification; no architecture rebuild.

**Negative.**

- **No WebSocket support through rewrites.** WS upgrades fail when routed through Firebase Hosting to Cloud Run. This is the architectural cost; ADR 0007 chooses SSE as the suite-wide real-time pattern in response.
- **60-second request timeout.** Long-running synchronous operations must be redesigned as async (kick off a job, poll for result, or SSE the progress).
- **32 MB request body limit.** Large uploads must go via signed Cloud Storage URLs, not POST through an app's API.
- **CDN cache can serve stale SSR pages to wrong users.** If an SSR response is accidentally `Cache-Control: public`, user A's page can be served to user B. The fix is mundane (`Cache-Control: private, no-store` on authenticated SSR) but easy to forget.
- **Service worker caching gotcha.** If Firebase Hosting CDN-caches `/sw.js`, deploys ship slowly. Set `Cache-Control: no-cache` on the SW.
- Less control over headers passing through; some `Forwarded`-family headers are rewritten.

**Neutral.**

- Vendor lock-in to Firebase Hosting is shallow. Migration to Load Balancer later is a DNS change plus configuration; Cloud Run services themselves don't change.
- Mobile keyboard, deep linking, and PWA install behave normally (this is just a routing layer; the apps render natively).

## Alternatives considered

**Cloud Load Balancer with URL maps.** The GCP-canonical production choice. Provides everything Firebase Hosting does plus WAF, IAP, fine-grained CDN rules. Costs $18-30/month baseline regardless of traffic. The right migration target *when traffic, security, or feature requirements justify it.* Not justified at our current scale.

**Custom Cloud Run routing service.** Same infra family as the apps. Full control: you write the proxy in Elysia or similar, handle cookies/headers, forward to the right service. Pros: full flexibility, ws support if needed, infra consistency. Cons: you write and maintain the proxy code, pay double cold-start latency (router cold, then target cold), and re-solve problems Firebase Hosting has solved. Not worth it at our stage.

**Cloud CDN in front of Cloud Run directly.** Faster CDN behavior than Firebase Hosting. But path-based routing across multiple Cloud Run services requires URL maps, which means... Load Balancer. So this collapses back to LB.

## Re-evaluation triggers

Switch to Load Balancer when any of:

- Bandwidth consistently exceeds $30/month (crossover point favors LB's flat fee).
- A use case genuinely requires WebSocket through public ingress AND SSE is provably insufficient.
- Cloud Armor (WAF) protection becomes required.
- Identity-Aware Proxy is required for internal-only routes.
- Fine-grained CDN cache rules become required for performance.

Until one of those is present-tense real, Firebase Hosting is the right answer.

## References

- Integration contract §§ 5, 6.
- ADR 0003 (single-origin PWA) — the architectural goal this implements.
- ADR 0007 (SSE over WebSockets) — the constraint this imposes on real-time architecture.
