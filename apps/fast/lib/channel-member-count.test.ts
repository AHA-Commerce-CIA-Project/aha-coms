import { describe, expect, it } from 'bun:test'

import { buildMemberCountMap } from './channel-member-count'

const base = {
  _count: { members: 4 },
  isPrivate: false,
  visibleToAllTeams: false,
  allowedTeamIds: [] as string[],
}

describe('buildMemberCountMap', () => {
  it('private channel returns _count.members + 1 regardless of count maps', () => {
    const ch = { ...base, id: 'ch-priv', isPrivate: true }
    const map = buildMemberCountMap([ch], 999, new Map([['t1', 50]]))
    expect(map.get('ch-priv')).toBe(5) // 4 members + 1 creator
  })

  it('public + visibleToAllTeams returns totalUserCount', () => {
    const ch = { ...base, id: 'ch-all', visibleToAllTeams: true }
    const map = buildMemberCountMap([ch], 42, new Map())
    expect(map.get('ch-all')).toBe(42)
  })

  it('visibleToAllTeams wins over allowedTeamIds (defensive mutual-exclusion check)', () => {
    // A channel that somehow has both set — visibleToAllTeams branch must win.
    const ch = { ...base, id: 'ch-both', visibleToAllTeams: true, allowedTeamIds: ['t1'] }
    const map = buildMemberCountMap([ch], 100, new Map([['t1', 7]]))
    expect(map.get('ch-both')).toBe(100)
  })

  it('public + single allowedTeamId returns the per-team count from the map', () => {
    const ch = { ...base, id: 'ch-team', allowedTeamIds: ['t1'] }
    const map = buildMemberCountMap([ch], 0, new Map([['t1', 12]]))
    expect(map.get('ch-team')).toBe(12)
  })

  it('public + multiple allowedTeamIds returns the sum across teams', () => {
    const ch = { ...base, id: 'ch-multi', allowedTeamIds: ['t1', 't2', 't3'] }
    const counts = new Map([['t1', 3], ['t2', 5], ['t3', 2]])
    const map = buildMemberCountMap([ch], 0, counts)
    expect(map.get('ch-multi')).toBe(10)
  })

  it('missing teamId in the map contributes 0 without throwing', () => {
    const ch = { ...base, id: 'ch-missing', allowedTeamIds: ['t1', 'missing-team'] }
    const map = buildMemberCountMap([ch], 0, new Map([['t1', 8]]))
    expect(map.get('ch-missing')).toBe(8) // missing-team → 0
  })

  it('public, neither visibleToAllTeams nor any allowedTeamIds falls back to _count.members + 1', () => {
    const ch = { ...base, id: 'ch-fallback' } // allowedTeamIds is []
    const map = buildMemberCountMap([ch], 999, new Map())
    expect(map.get('ch-fallback')).toBe(5) // 4 members + 1
  })

  it('batched call assigns the correct count to each channel in one pass', () => {
    const channels = [
      { ...base, id: 'priv', isPrivate: true },
      { ...base, id: 'all', visibleToAllTeams: true },
      { ...base, id: 'team', allowedTeamIds: ['t1', 't2'] },
      { ...base, id: 'fallback' },
    ]
    const counts = new Map([['t1', 6], ['t2', 4]])
    const map = buildMemberCountMap(channels, 50, counts)

    expect(map.get('priv')).toBe(5)   // _count.members(4) + 1
    expect(map.get('all')).toBe(50)   // totalUserCount
    expect(map.get('team')).toBe(10)  // 6 + 4
    expect(map.get('fallback')).toBe(5) // _count.members(4) + 1
    expect(map.size).toBe(4)
  })
})
