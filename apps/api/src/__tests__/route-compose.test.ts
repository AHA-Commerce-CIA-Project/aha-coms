import { describe, it, expect } from 'bun:test'

/**
 * Regression test for an Elysia/memoirist routing conflict that crashed
 * the portal at startup. cb34577 mounted `appManifestRoutes` with
 * prefix `/apps/:slug/manifest` while sibling routes (apps.ts,
 * app-webhooks.ts) already registered `/apps/:id/...`. memoirist's
 * router rejects two different parameter names at the same trie
 * position with:
 *
 *   error: Cannot create route "/api/v1/apps/:slug/manifest/" with
 *   parameter "slug" because a route already exists with a different
 *   parameter name ("id") in the same location
 *
 * The error fires at compose time — i.e. when `app.fetch` or
 * `app.handle` is first invoked, OR (in production) when Elysia's
 * `.listen()` triggers internal route compilation. The unit tests in
 * `routes/__tests__/app-manifest.test.ts` only exercise the route in
 * isolation (no sibling routes), so they didn't catch the conflict;
 * the failure surfaced only at Cloud Run cold-start. This test forces
 * the full app to compose, catching any future param-name collision
 * in CI before deploy.
 */
describe('Elysia route compose (regression test)', () => {
  it('imports apps/api/src/index.ts and serves a request without throwing', async () => {
    const { app } = await import('../index')
    // .handle() forces the router to build. A param-name conflict in any
    // mounted prefix throws here before any handler runs.
    const res = await app.handle(new Request('http://localhost/api/healthz'))
    // Status is irrelevant — we only care that compose did not throw.
    expect(res).toBeInstanceOf(Response)
  })
})
