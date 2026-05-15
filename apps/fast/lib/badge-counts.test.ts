import { describe, expect, it, mock } from 'bun:test'

import { fetchBadgeCounts } from './badge-counts'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('fetchBadgeCounts', () => {
  it('fires the four badge endpoints in parallel and returns a single shape', async () => {
    const urls: string[] = []
    const fakeFetch = mock(async (url: string) => {
      urls.push(url)
      const map: Record<string, unknown> = {
        '/fast/api/channels/unread': { unreadCount: 3 },
        '/fast/api/chat/unread': { unreadCount: 5 },
        '/fast/api/orbit/unclaimed': { unclaimedCount: 2 },
        '/fast/api/changelog': { unseenCount: 1 },
      }
      return jsonResponse(map[url] ?? {})
    }) as unknown as typeof fetch

    const counts = await fetchBadgeCounts(fakeFetch)

    expect(urls).toContain('/fast/api/channels/unread')
    expect(urls).toContain('/fast/api/chat/unread')
    expect(urls).toContain('/fast/api/orbit/unclaimed')
    expect(urls).toContain('/fast/api/changelog')
    expect(urls.length).toBe(4)
    expect(counts).toEqual({
      channelsUnread: 3,
      dmUnread: 5,
      orbitUnclaimed: 2,
      changelogUnseen: 1,
    })
  })

  it('returns 0 for any endpoint that responds non-2xx — one failure does not poison the others', async () => {
    const fakeFetch = mock(async (url: string) => {
      if (url.includes('orbit')) return new Response(null, { status: 500 })
      const map: Record<string, unknown> = {
        '/fast/api/channels/unread': { unreadCount: 7 },
        '/fast/api/chat/unread': { unreadCount: 4 },
        '/fast/api/changelog': { unseenCount: 9 },
      }
      return jsonResponse(map[url] ?? {})
    }) as unknown as typeof fetch

    const counts = await fetchBadgeCounts(fakeFetch)

    expect(counts.orbitUnclaimed).toBe(0)
    expect(counts.channelsUnread).toBe(7)
    expect(counts.dmUnread).toBe(4)
    expect(counts.changelogUnseen).toBe(9)
  })

  it('returns 0 for any endpoint whose body is missing the expected count field', async () => {
    const fakeFetch = mock(async () => jsonResponse({})) as unknown as typeof fetch

    const counts = await fetchBadgeCounts(fakeFetch)

    expect(counts).toEqual({
      channelsUnread: 0,
      dmUnread: 0,
      orbitUnclaimed: 0,
      changelogUnseen: 0,
    })
  })
})
