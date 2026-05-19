/**
 * Password policy — Spec 06 PR F (revised 2026-05-19).
 *
 * Authoritative server-side gate. Used by:
 *   - POST /api/auth/password/set
 *   - POST /v1/identities
 *
 * **Length is the only enforced check.** Per NIST SP 800-63B and OWASP ASVS L2,
 * composition rules (letter+digit, capital, special) are research-debunked —
 * users defeat them trivially (`Password1`, `Pa$$w0rd1`) without raising
 * actual strength. Length plus rate-limiting plus optional breach-corpus
 * checks (future FU) do the real work.
 *
 * The strength meter lives client-side (portal-web's
 * `password-strength-meter.svelte`) and uses zxcvbn-ts for pattern-aware
 * scoring. The server enforces only the length floor.
 */

import { scorePasswordStrength, type PasswordStrengthTier } from '@coms-portal/shared'

export type ValidateMinimumResult =
  | { ok: true }
  | { ok: false; reason: string }

export const PASSWORD_MIN_LENGTH = 12

export function validateMinimum(pwd: string): ValidateMinimumResult {
  if (typeof pwd !== 'string') {
    return { ok: false, reason: 'Password is required.' }
  }
  if (pwd.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, reason: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` }
  }
  return { ok: true }
}

/**
 * Server-side fallback strength tier (length-based only). The client-side
 * meter uses zxcvbn-ts and is the authoritative UI signal. This export is
 * retained for any future server-side gate (e.g. "admins must be ≥ strong")
 * that doesn't want the zxcvbn dependency.
 */
export function scoreStrength(pwd: string): PasswordStrengthTier {
  return scorePasswordStrength(pwd)
}
