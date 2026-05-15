export type BadgeCounts = {
  channelsUnread: number
  dmUnread: number
  orbitUnclaimed: number
  changelogUnseen: number
}

export const ZERO_BADGE_COUNTS: BadgeCounts = {
  channelsUnread: 0,
  dmUnread: 0,
  orbitUnclaimed: 0,
  changelogUnseen: 0,
}

async function readCount(
  res: PromiseSettledResult<Response>,
  key: 'unreadCount' | 'unclaimedCount' | 'unseenCount',
): Promise<number> {
  if (res.status !== 'fulfilled') return 0
  if (!res.value.ok) return 0
  try {
    const body = (await res.value.json()) as Record<string, unknown>
    const raw = body?.[key]
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0
  } catch {
    return 0
  }
}

export async function fetchBadgeCounts(
  fetchFn: typeof fetch = fetch,
): Promise<BadgeCounts> {
  const [channels, dm, orbit, changelog] = await Promise.allSettled([
    fetchFn('/fast/api/channels/unread'),
    fetchFn('/fast/api/chat/unread'),
    fetchFn('/fast/api/orbit/unclaimed'),
    fetchFn('/fast/api/changelog'),
  ])

  const [channelsUnread, dmUnread, orbitUnclaimed, changelogUnseen] = await Promise.all([
    readCount(channels, 'unreadCount'),
    readCount(dm, 'unreadCount'),
    readCount(orbit, 'unclaimedCount'),
    readCount(changelog, 'unseenCount'),
  ])

  return { channelsUnread, dmUnread, orbitUnclaimed, changelogUnseen }
}
