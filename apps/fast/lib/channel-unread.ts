export type ChannelUnreadInput = { id: string; purpose: string | null }
export type GroupedCount = { channelId: string; _count: { _all: number } }

export type ChannelUnreadResult = {
  unreadCount: number
  perChannel: Record<string, number>
  perPurpose: { discussion: number; assign_task: number }
}

export function mergeChannelUnreadCounts(
  channels: ChannelUnreadInput[],
  groupedCounts: GroupedCount[],
): ChannelUnreadResult {
  const countByChannel = new Map<string, number>()
  for (const g of groupedCounts) countByChannel.set(g.channelId, g._count._all)

  const perChannel: Record<string, number> = {}
  const perPurpose = { discussion: 0, assign_task: 0 }
  let unreadCount = 0

  for (const c of channels) {
    const n = countByChannel.get(c.id) ?? 0
    perChannel[c.id] = n
    unreadCount += n
    if (n > 0) {
      const key = c.purpose === 'assign_task' ? 'assign_task' : 'discussion'
      perPurpose[key] += n
    }
  }

  return { unreadCount, perChannel, perPurpose }
}
