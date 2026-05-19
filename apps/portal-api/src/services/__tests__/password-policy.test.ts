import { describe, expect, test } from 'bun:test'
import { validateMinimum, scoreStrength, PASSWORD_MIN_LENGTH } from '../password-policy'

describe('validateMinimum (length-only, post 2026-05-19 spec revision)', () => {
  test('rejects empty string', () => {
    const result = validateMinimum('')
    expect(result.ok).toBe(false)
  })

  test('rejects 11 characters', () => {
    const result = validateMinimum('abcdefghijk')
    expect(result).toEqual({ ok: false, reason: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` })
  })

  test('accepts exactly 12 characters', () => {
    const result = validateMinimum('abcdefghijkl')
    expect(result).toEqual({ ok: true })
  })

  test('accepts 12 chars of digits only (no composition rule)', () => {
    // 2026-05-19 revision dropped letter+digit composition. zxcvbn on the
    // client side will rate this very weak — but the server only enforces
    // length. UI feedback steers users away from this; the server doesn't
    // reject it.
    expect(validateMinimum('123456789012')).toEqual({ ok: true })
  })

  test('accepts long strong password', () => {
    expect(validateMinimum('Sup3rSecur3!P@ss')).toEqual({ ok: true })
  })

  test('non-string input is rejected gracefully', () => {
    // @ts-expect-error — exercising the runtime guard
    expect(validateMinimum(null).ok).toBe(false)
  })
})

describe('scoreStrength (length-only fallback)', () => {
  test('weak below 12 chars', () => {
    expect(scoreStrength('')).toBe('weak')
    expect(scoreStrength('short')).toBe('weak')
    expect(scoreStrength('abcdefghijk')).toBe('weak')
  })

  test('fair at 12-15 chars', () => {
    expect(scoreStrength('abcdefghijkl')).toBe('fair')
    expect(scoreStrength('abcdefghijklmno')).toBe('fair')
  })

  test('strong at 16+ chars', () => {
    expect(scoreStrength('abcdefghijklmnop')).toBe('strong')
    expect(scoreStrength('Sup3rSecur3!P@ss-and-then-some')).toBe('strong')
  })
})
