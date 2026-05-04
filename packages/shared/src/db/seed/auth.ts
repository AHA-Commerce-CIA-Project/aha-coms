// Spec 08 PR A1 stub.
// The pre-A1 seedAuth() inserted dev rows into the better-auth `authUser` table, which has
// been dropped. Post-cutover, identity is materialised by the portal `user.provisioned`
// webhook (handled in PR A2 via services/portal-events/handle-user-provisioned.ts) and by
// the broker exchange. Local development that needs seeded heroes_profiles rows should be
// reimplemented against the new flow in PR A2.

export async function seedAuth(): Promise<void> {
  console.log('[spec-08-pr-a1] seedAuth() is a no-op; identity provisioning moved to portal webhooks.')
}
