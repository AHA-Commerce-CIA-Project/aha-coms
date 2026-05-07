import { defineManifest } from '@coms-portal/sdk'

/**
 * Source-of-truth manifest for Heroes' registration with the COMS portal.
 *
 * This file is registered with the portal on every CD deploy via
 * `coms-portal-cli register-manifest` (see .github/workflows/deploy.yml).
 * The portal stores it in the `app_manifests` row keyed by `slug='heroes'`
 * and merges later registrations forward via the `GREATEST(schemaVersion)`
 * non-regression rule. Editing the portal admin UI's manifest editor for
 * Heroes is a current-state view only — the next deploy overwrites any
 * manual edits with this file's contents (Spec 02 §Q4).
 *
 * Editing rules:
 * - Bump `schemaVersion` whenever a backwards-incompatible change lands
 *   (added required field with no default, removed field, narrowed type).
 *   Forward-only — never decrement.
 * - `taxonomies` lists the portal taxonomy IDs Heroes subscribes to. The
 *   portal fans webhook events for these and only these taxonomies.
 * - `configSchema` is for app-local user/tenant knobs only. Role lives on
 *   `heroes_profiles.role` and is broadcast through `envelope.appRole`,
 *   not through this manifest (Heroes role refactor, 2026-05-06).
 */
export default defineManifest({
  appId: 'heroes',
  displayName: 'Heroes',
  schemaVersion: 2,
  taxonomies: ['branches', 'teams', 'departments'],
  configSchema: {
    leaderboard_eligible: { type: 'boolean', default: true },
    starting_points: { type: 'integer', default: 0 },
  },
})
