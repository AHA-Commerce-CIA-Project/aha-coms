import { describe, test, expect, mock } from 'bun:test'

// Stub DB and sheets-client before importing the service so module-level
// side-effects (postgres connection, env reads) don't run during unit tests.
mock.module('~/db', () => ({ db: {} }))
mock.module('~/db/schema', () => {
  return {
    identityUsers: {},
    teamMembers: {},
    appRegistry: {},
    teams: {},
    teamAppAccess: {},
    accessAuditLog: {},
  }
})
mock.module('drizzle-orm', () => {
  return {
    eq: () => {},
    inArray: () => {},
    // sql and relations added to satisfy the new schema re-exports in ~/db/schema/index.ts
    sql: new Proxy(
      (strings: TemplateStringsArray) => strings.join(''),
      { get: (_t, prop) => prop },
    ),
    relations: () => ({}),
    and: () => ({}),
  }
})
mock.module('../sheets-client', () => ({
  readPersonalEmailSheet: async () => [],
}))

const { matchScore, normalizeName, nameTokens } = await import('../personal-email-sync')

describe('normalizeName', () => {
  test('lowercases and trims', () => {
    expect(normalizeName('  John Doe  ')).toBe('john doe')
  })

  test('strips periods from initials', () => {
    expect(normalizeName('John A. Doe')).toBe('john a doe')
  })

  test('collapses multiple spaces', () => {
    expect(normalizeName('John  Doe')).toBe('john doe')
  })
})

describe('nameTokens', () => {
  test('returns first, last and full tokens for two-word name', () => {
    expect(nameTokens('John Doe')).toEqual({ first: 'john', last: 'doe', full: 'john doe' })
  })

  test('returns only first token for single-word name', () => {
    expect(nameTokens('Pauzi')).toEqual({ first: 'pauzi', last: '', full: 'pauzi' })
  })

  test('uses last word as last token for three-word name', () => {
    const tokens = nameTokens('Adiella Aisy Oktaviani')
    expect(tokens.first).toBe('adiella')
    expect(tokens.last).toBe('oktaviani')
  })
})

describe('matchScore', () => {
  test('exact full match returns 2', () => {
    expect(matchScore('John Doe', 'John Doe')).toBe(2)
  })

  test('first+last match with different middle returns 1', () => {
    expect(matchScore('Adiella Oktaviani', 'Adiella Aisy Oktaviani')).toBe(1)
  })

  test('no overlap returns 0', () => {
    expect(matchScore('Alice', 'Bob')).toBe(0)
  })

  test('single-word sheet name matching DB first name returns 1', () => {
    expect(matchScore('Pauzi', 'Pauzi AHA')).toBe(1)
  })

  test('different first names return 0 even with same last name', () => {
    expect(matchScore('John Doe', 'Jane Doe')).toBe(0)
  })
})
