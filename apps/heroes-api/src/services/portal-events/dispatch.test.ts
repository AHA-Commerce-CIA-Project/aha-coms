import { describe, expect, it } from 'bun:test'
import { dispatchPortalEvent, type PortalEventHandlerMap } from './dispatch'

describe('dispatchPortalEvent', () => {
  it('routes a known event name to its handler with the parsed body', async () => {
    let captured: { event?: string; body?: unknown } = {}
    const handlers: PortalEventHandlerMap = {
      'user.provisioned': async (body) => {
        captured = { event: 'user.provisioned', body }
      },
    }

    await dispatchPortalEvent('user.provisioned', { portalSub: 'abc' }, { handlers })

    expect(captured.event).toBe('user.provisioned')
    expect(captured.body).toEqual({ portalSub: 'abc' })
  })

  it('returns silently for unknown event names instead of throwing', async () => {
    const handlers: PortalEventHandlerMap = {}
    await expect(
      dispatchPortalEvent('made.up.event', { anything: true }, { handlers }),
    ).resolves.toBeUndefined()
  })

  it('propagates errors thrown by the handler so the route can surface 5xx for DLQ retry', async () => {
    const handlers: PortalEventHandlerMap = {
      'user.provisioned': async () => {
        throw new Error('handler boom')
      },
    }
    await expect(
      dispatchPortalEvent('user.provisioned', {}, { handlers }),
    ).rejects.toThrow('handler boom')
  })
})
