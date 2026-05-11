// Auth is brokered by the COMS portal. This package no longer hosts a credential
// provider — sessions are minted by packages/web after a portal handoff and stored
// directly in the better-auth-shaped session table. See:
//   - packages/shared/src/auth/session.ts
//   - packages/web/src/routes/auth/portal/exchange/+server.ts
//   - portal.integration.json
export {}
