export type ChannelForMemberCount = {
  id: string
  isPrivate: boolean
  visibleToAllTeams: boolean
  allowedTeamIds: string[]
  _count: { members: number }
}

export type TeamUserCountRow = { teamId: string | null; _count: { _all: number } }

/**
 * Derive member counts for every channel in a single in-memory pass.
 *
 * Priority (matches the original GET handler's if/else if order):
 *  1. private OR (not visibleToAllTeams AND no allowedTeamIds) → _count.members + 1
 *  2. public + visibleToAllTeams → totalUserCount
 *  3. public + allowedTeamIds → sum of per-team counts from the map (missing = 0)
 */
export function buildMemberCountMap(
  channels: ChannelForMemberCount[],
  totalUserCount: number,
  userCountByTeamId: Map<string, number>,
): Map<string, number> {
  const result = new Map<string, number>()
  for (const ch of channels) {
    let memberCount: number
    if (!ch.isPrivate && ch.visibleToAllTeams) {
      memberCount = totalUserCount
    } else if (!ch.isPrivate && ch.allowedTeamIds.length > 0) {
      memberCount = ch.allowedTeamIds.reduce(
        (sum, teamId) => sum + (userCountByTeamId.get(teamId) ?? 0),
        0,
      )
    } else {
      memberCount = ch._count.members + 1
    }
    result.set(ch.id, memberCount)
  }
  return result
}
