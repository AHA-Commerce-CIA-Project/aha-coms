import { describe, expect, test } from 'bun:test'
import { getSessionCookieValue } from '../session-cookie'

describe('getSessionCookieValue', () => {
  test('returns undefined when session cookie is absent', () => {
    expect(getSessionCookieValue('foo=bar; theme=dark')).toBeUndefined()
  })

  test('returns the __session cookie value from a mixed cookie header', () => {
    expect(getSessionCookieValue('foo=bar; __session=abc123; theme=dark')).toBe('abc123')
  })

  test('preserves equals signs inside the session cookie value', () => {
    expect(getSessionCookieValue('__session=abc=123==; theme=dark')).toBe('abc=123==')
  })
})
