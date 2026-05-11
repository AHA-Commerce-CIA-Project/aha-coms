import { expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = join(import.meta.dir, '..', '..', '..', '..')

test('workspace sync feature is not exposed in source surfaces', () => {
  expect(existsSync(join(repoRoot, 'apps/portal-api/src/routes/workspace-sync.ts'))).toBe(false)
  expect(existsSync(join(repoRoot, 'apps/portal-web/src/routes/(authed)/admin/workspace-sync/+page.svelte'))).toBe(false)

  const apiIndex = readFileSync(join(repoRoot, 'apps/portal-api/src/index.ts'), 'utf8')
  expect(apiIndex.includes('workspaceSyncRoutes')).toBe(false)
})
