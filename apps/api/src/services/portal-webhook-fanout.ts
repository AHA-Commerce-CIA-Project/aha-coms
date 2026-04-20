/**
 * Re-export shim for `dispatchPortalWebhook`.
 *
 * Why: Bun's `mock.module()` registrations are process-global and registered
 * at file-load time, so a partial mock of `./webhook-dispatcher` (e.g. one
 * exposing only `dispatchPortalWebhook`) leaks across test files and breaks
 * tests that import `signWebhookBody`, `verifyWebhookSignature`, or
 * `deliverWebhook` from the same module. Routing the dispatch path through a
 * dedicated re-export file lets call-site tests mock this thin module without
 * touching the dispatcher's signing/delivery primitives.
 */
export { dispatchPortalWebhook } from './webhook-dispatcher'
