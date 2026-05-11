import { describe, test, expect } from 'bun:test'
import { matchScore, normalizeName, nameTokens } from '../name-matching'

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

  test('DB single-word name matching sheet multi-word name returns 1 (symmetric)', () => {
    expect(matchScore('Fauzi AHA', 'Fauzi')).toBe(1)
  })

  test('both directions match symmetrically for single-name cases', () => {
    expect(matchScore('Fauzi', 'Fauzi AHA')).toBe(1)
    expect(matchScore('Fauzi AHA', 'Fauzi')).toBe(1)
  })

  test('different last names still return 0 when both have last names', () => {
    expect(matchScore('Fauzi AHA', 'Fauzi Ramadhan')).toBe(0)
  })

  test('different first names return 0 even with same last name', () => {
    expect(matchScore('John Doe', 'Jane Doe')).toBe(0)
  })
})
