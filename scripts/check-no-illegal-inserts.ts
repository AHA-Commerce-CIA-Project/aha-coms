import { readFileSync } from 'fs'
import { execSync } from 'child_process'

export const ILLEGAL_USERS_INSERT_PATTERN =
  /(INSERT\s+INTO\s+users\b)|(\.insert\(\s*users\s*\))/i

export const ILLEGAL_PROFILES_INSERT_PATTERN =
  /(INSERT\s+INTO\s+heroes_profiles\b)|(\.insert\(\s*heroesProfiles\s*\))/i

export const PROFILES_INSERT_WHITELIST: readonly string[] = [
  'packages/server/src/services/portal-events/handle-user-provisioned.ts',
  'packages/shared/src/auth/session.ts',
]

export interface ScanInput {
  path: string
  content: string
}

export type ViolationKind = 'users-insert' | 'profiles-insert-outside-whitelist'

export interface Violation {
  path: string
  line: number
  kind: ViolationKind
  text: string
}

export function scanForIllegalInserts(inputs: readonly ScanInput[]): Violation[] {
  const violations: Violation[] = []
  for (const { path, content } of inputs) {
    const lines = content.split('\n')
    const isWhitelistedForProfiles = PROFILES_INSERT_WHITELIST.includes(path)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!
      if (ILLEGAL_USERS_INSERT_PATTERN.test(line)) {
        violations.push({ path, line: i + 1, kind: 'users-insert', text: line.trim() })
      }
      if (!isWhitelistedForProfiles && ILLEGAL_PROFILES_INSERT_PATTERN.test(line)) {
        violations.push({
          path,
          line: i + 1,
          kind: 'profiles-insert-outside-whitelist',
          text: line.trim(),
        })
      }
    }
  }
  return violations
}

function listTrackedSourceFiles(): string[] {
  const out = execSync(
    'git ls-files "packages/**/*.ts" "packages/**/*.sql" "scripts/**/*.ts" "scripts/**/*.sh"',
    { encoding: 'utf8' },
  )
  return out
    .split('\n')
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !p.endsWith('.test.ts'))
    .filter((p) => !p.includes('/migrations/'))
    .filter((p) => !p.includes('/node_modules/'))
}

function main(): void {
  const files = listTrackedSourceFiles()
  const inputs: ScanInput[] = files.map((path) => ({
    path,
    content: readFileSync(path, 'utf8'),
  }))
  const violations = scanForIllegalInserts(inputs)
  if (violations.length === 0) {
    console.log(`[ci-guard] no illegal inserts found across ${inputs.length} source files`)
    return
  }
  console.error(`[ci-guard] FAILED — ${violations.length} illegal insert(s):`)
  for (const v of violations) {
    console.error(`  ${v.path}:${v.line}  [${v.kind}]  ${v.text}`)
  }
  process.exit(1)
}

if (import.meta.main) {
  main()
}
