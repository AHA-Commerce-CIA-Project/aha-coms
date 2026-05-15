import { describe, expect, it } from 'bun:test'

import { mergeChannelUnreadCounts } from './channel-unread'

describe('mergeChannelUnreadCounts', () => {
  it('joins grouped counts onto channel rows by channelId', () => {
    const out = mergeChannelUnreadCounts(
      [
        { id: 'c1', purpose: 'discussion' },
        { id: 'c2', purpose: 'discussion' },
        { id: 'c3', purpose: 'discussion' },
      ],
      [
        { channelId: 'c1', _count: { _all: 3 } },
        { channelId: 'c3', _count: { _all: 5 } },
      ],
    )

    expect(out.perChannel).toEqual({ c1: 3, c2: 0, c3: 5 })
    expect(out.unreadCount).toBe(8)
  })

  it('routes assign_task channels into perPurpose.assign_task, everything else into discussion', () => {
    const out = mergeChannelUnreadCounts(
      [
        { id: 'a', purpose: 'assign_task' },
        { id: 'd', purpose: 'discussion' },
        { id: 'x', purpose: null },
      ],
      [
        { channelId: 'a', _count: { _all: 4 } },
        { channelId: 'd', _count: { _all: 2 } },
        { channelId: 'x', _count: { _all: 1 } },
      ],
    )

    expect(out.perPurpose.assign_task).toBe(4)
    expect(out.perPurpose.discussion).toBe(3)
  })

  it('omits zero-count channels from the perPurpose sum', () => {
    const out = mergeChannelUnreadCounts(
      [
        { id: 'a', purpose: 'assign_task' },
        { id: 'b', purpose: 'discussion' },
      ],
      [{ channelId: 'b', _count: { _all: 7 } }],
    )

    expect(out.perPurpose.assign_task).toBe(0)
    expect(out.perPurpose.discussion).toBe(7)
    expect(out.unreadCount).toBe(7)
  })

  it('returns zeros across the board when no channels are visible', () => {
    const out = mergeChannelUnreadCounts([], [])
    expect(out).toEqual({
      unreadCount: 0,
      perChannel: {},
      perPurpose: { discussion: 0, assign_task: 0 },
    })
  })

  it('ignores grouped counts for channels the user cannot see (defensive)', () => {
    // A grouped count for an unknown channelId — should not influence the
    // visible-channel rollup at all.
    const out = mergeChannelUnreadCounts(
      [{ id: 'visible', purpose: 'discussion' }],
      [
        { channelId: 'visible', _count: { _all: 2 } },
        { channelId: 'leaked', _count: { _all: 99 } },
      ],
    )

    expect(out.perChannel).toEqual({ visible: 2 })
    expect(out.unreadCount).toBe(2)
  })
})
