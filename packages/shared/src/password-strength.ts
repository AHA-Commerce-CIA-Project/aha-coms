/**
 * Password strength tier — shared length-based fallback.
 *
 * IMPORTANT: The authoritative strength signal in portal-web is the
 * zxcvbn-ts-backed meter in `password-strength-meter.svelte`. This helper is
 * a tiny dependency-free fallback for non-UI consumers (server-side gates,
 * tests, future CLI tools) that don't want to ship the zxcvbn dictionary
 * bundle.
 *
 * Tier rules (length-only, post-Spec-06-PR-F-revised):
 *   - `weak`   — < 12 chars (fails the server minimum)
 *   - `fair`   — 12-15 chars
 *   - `strong` — 16+ chars
 *
 * Composition rules (capital / digit / special) were removed in the 2026-05-19
 * spec revision because they are research-debunked: users defeat them
 * trivially (`Password1`, `Pa$$w0rd1`) without raising actual strength. The
 * client-side zxcvbn meter catches dictionary words, sequences, keyboard
 * patterns, leet substitution, and personal-info matches — which is what
 * actually measures resistance to real attacks.
 */

export type PasswordStrengthTier = 'weak' | 'fair' | 'strong'

const MIN_LENGTH = 12
const STRONG_LENGTH = 16

export function scorePasswordStrength(pwd: string): PasswordStrengthTier {
  if (typeof pwd !== 'string') return 'weak'
  if (pwd.length < MIN_LENGTH) return 'weak'
  if (pwd.length >= STRONG_LENGTH) return 'strong'
  return 'fair'
}
