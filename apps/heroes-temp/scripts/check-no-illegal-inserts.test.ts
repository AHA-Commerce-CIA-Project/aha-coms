import { describe, expect, it } from 'bun:test'
import {
  ILLEGAL_USERS_INSERT_PATTERN,
  ILLEGAL_PROFILES_INSERT_PATTERN,
  scanForIllegalInserts,
} from './check-no-illegal-inserts'

describe('ILLEGAL_USERS_INSERT_PATTERN', () => {
  it('matches a raw INSERT INTO users statement', () => {
    expect('INSERT INTO users (id, name) VALUES (1, "x");').toMatch(ILLEGAL_USERS_INSERT_PATTERN)
  })

  it('matches case-insensitively', () => {
    expect('insert into users(...)').toMatch(ILLEGAL_USERS_INSERT_PATTERN)
    expect('Insert Into Users (id)').toMatch(ILLEGAL_USERS_INSERT_PATTERN)
  })

  it('matches drizzle-style db.insert(users) calls', () => {
    expect('await db.insert(users).values({...})').toMatch(ILLEGAL_USERS_INSERT_PATTERN)
  })

  it('does not match insert into heroes_profiles or other tables containing "users" as a substring', () => {
    expect('INSERT INTO heroes_profiles (id) VALUES (1);').not.toMatch(ILLEGAL_USERS_INSERT_PATTERN)
    expect('INSERT INTO usersroles (id) VALUES (1);').not.toMatch(ILLEGAL_USERS_INSERT_PATTERN)
    expect('await db.insert(userConfigCache).values({...})').not.toMatch(
      ILLEGAL_USERS_INSERT_PATTERN,
    )
  })
})

describe('ILLEGAL_PROFILES_INSERT_PATTERN', () => {
  it('matches an INSERT INTO heroes_profiles statement', () => {
    expect('INSERT INTO heroes_profiles (id) VALUES (1)').toMatch(ILLEGAL_PROFILES_INSERT_PATTERN)
  })

  it('matches drizzle-style db.insert(heroesProfiles)', () => {
    expect('await db.insert(heroesProfiles).values(...)').toMatch(ILLEGAL_PROFILES_INSERT_PATTERN)
  })
})

describe('scanForIllegalInserts', () => {
  it('returns no violations when no illegal inserts are present', () => {
    const fileContent = `
      import { db } from './db'
      await db.insert(taxonomyCache).values({...})
    `
    const violations = scanForIllegalInserts([
      { path: 'src/legitimate.ts', content: fileContent },
    ])
    expect(violations).toEqual([])
  })

  it('flags every INSERT INTO users occurrence with file path and line number', () => {
    const fileContent = ['line 1', 'INSERT INTO users (a) VALUES (1)', 'line 3'].join('\n')
    const violations = scanForIllegalInserts([{ path: 'src/dirty.ts', content: fileContent }])
    expect(violations).toHaveLength(1)
    expect(violations[0]).toMatchObject({
      path: 'src/dirty.ts',
      line: 2,
      kind: 'users-insert',
    })
  })

  it('allows db.insert(heroesProfiles) inside the two whitelisted writers', () => {
    const fileContent = 'await db.insert(heroesProfiles).values({...})'
    const violations = scanForIllegalInserts([
      {
        path: 'packages/server/src/services/portal-events/handle-user-provisioned.ts',
        content: fileContent,
      },
      {
        path: 'packages/shared/src/auth/session.ts',
        content: fileContent,
      },
    ])
    expect(violations).toEqual([])
  })

  it('flags db.insert(heroesProfiles) outside the whitelisted writers', () => {
    const fileContent = 'await db.insert(heroesProfiles).values({...})'
    const violations = scanForIllegalInserts([
      { path: 'packages/server/src/services/random-other.ts', content: fileContent },
    ])
    expect(violations).toHaveLength(1)
    expect(violations[0]?.kind).toBe('profiles-insert-outside-whitelist')
  })
})
