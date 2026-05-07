import { describe, it, expect } from 'bun:test'

/**
 * Regression test for an Elysia/memoirist routing conflict that crashed
 * the portal at startup. cb34577 mounted `appManifestRoutes` with
 * prefix `/apps/:slug/manifest` while sibling routes (apps.ts,
 * app-webhooks.ts) already registered `/apps/:id/...`. memoirist's
 * router rejects two different parameter names at the same trie
 * position with:
 *
 *   error: Cannot create route "/api/v1/apps/:slug/manifest/" with
 *   parameter "slug" because a route already exists with a different
 *   parameter name ("id") in the same location
 *
 * The error fires at compose time — i.e. when `app.fetch` or
 * `app.handle` is first invoked, OR (in production) when Elysia's
 * `.listen()` triggers internal route compilation. The unit tests in
 * `routes/__tests__/app-manifest.test.ts` only exercise the route in
 * isolation (no sibling routes), so they didn't catch the conflict;
 * the failure surfaced only at Cloud Run cold-start.
 *
 * The first test below forces the full app to compose so memoirist
 * itself rejects any conflict at unit-test time. The second test walks
 * `app.routes` directly and surfaces a friendly diagnostic — listing
 * the conflicting route pair, the trie position, and both parameter
 * names — without depending on memoirist throwing. It generalises the
 * regression check to any prefix, whether the conflict happens at a
 * top-level URL segment or inside a deeply nested group.
 */
describe('Elysia route compose (regression test)', () => {
  it('imports apps/api/src/index.ts and serves a request without throwing', async () => {
    const { app } = await import('../index')
    // .handle() forces the router to build. A param-name conflict in any
    // mounted prefix throws here before any handler runs.
    const res = await app.handle(new Request('http://localhost/api/healthz'))
    // Status is irrelevant — we only care that compose did not throw.
    expect(res).toBeInstanceOf(Response)
  })

  it('every parameter at a given trie position uses one consistent name', async () => {
    const { app } = await import('../index')
    const conflicts = findParamNameConflicts(
      (app.routes as { path: string }[]).map((r) => r.path),
    )
    if (conflicts.length > 0) {
      const message = conflicts
        .map(
          (c) =>
            `  at "${c.position || '/'}": ":${c.firstName}" (in ${c.firstRoute}) vs ":${c.conflictingName}" (in ${c.conflictingRoute})`,
        )
        .join('\n')
      throw new Error(
        `Found ${conflicts.length} memoirist param-name conflict(s) — at least one mounted prefix uses two different parameter names at the same trie position. Each new route under one of these prefixes must reuse the existing parameter name (memoirist matches on names, not values), even when the captured value is semantically different (e.g. ":id" capturing a slug):\n${message}`,
      )
    }
    expect(conflicts).toEqual([])
  })

  // Guards against silent regressions in `findParamNameConflicts` itself —
  // if the helper above ever stops detecting conflicts, the route-tree check
  // would trivially pass even on a real D4-style bug. Synthetic inputs prove
  // the detector still fires on the original failure shape and stays quiet
  // when the parameter names agree.
  it('findParamNameConflicts detects the D4 :slug-vs-:id failure shape', () => {
    const conflicts = findParamNameConflicts([
      '/api/v1/apps/:id/webhooks',
      '/api/v1/apps/:slug/manifest',
    ])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toMatchObject({
      position: '/api/v1/apps',
      firstName: 'id',
      conflictingName: 'slug',
    })
  })

  it('findParamNameConflicts is silent when the same parameter name is reused', () => {
    expect(
      findParamNameConflicts([
        '/api/v1/apps/:id/webhooks',
        '/api/v1/apps/:id/manifest',
      ]),
    ).toEqual([])
  })
})

interface ParamConflict {
  position: string
  firstName: string
  firstRoute: string
  conflictingName: string
  conflictingRoute: string
}

interface TrieNode {
  literals: Map<string, TrieNode>
  param?: { name: string; node: TrieNode; firstRoute: string }
}

function findParamNameConflicts(paths: string[]): ParamConflict[] {
  const root: TrieNode = { literals: new Map() }
  const conflicts: ParamConflict[] = []

  for (const path of paths) {
    const segments = path.split('/').filter(Boolean)
    let node = root
    let prefix = ''
    let stop = false

    for (const seg of segments) {
      if (stop) break

      if (seg.startsWith(':')) {
        const name = seg.slice(1)
        if (node.param) {
          if (node.param.name !== name) {
            conflicts.push({
              position: prefix,
              firstName: node.param.name,
              firstRoute: node.param.firstRoute,
              conflictingName: name,
              conflictingRoute: path,
            })
            // Stop walking this path — once a conflict surfaces on the prefix
            // we don't want to double-report nested segments under the same
            // mismatched edge.
            stop = true
            break
          }
          node = node.param.node
        } else {
          const newNode: TrieNode = { literals: new Map() }
          node.param = { name, node: newNode, firstRoute: path }
          node = newNode
        }
      } else {
        // Wildcards (`*`) and literal segments share trie keying — memoirist
        // only cares about parameter-name uniformity, not literal/wildcard
        // collisions, which Elysia already validates separately.
        let child = node.literals.get(seg)
        if (!child) {
          child = { literals: new Map() }
          node.literals.set(seg, child)
        }
        node = child
      }
      prefix += '/' + seg
    }
  }

  return conflicts
}
