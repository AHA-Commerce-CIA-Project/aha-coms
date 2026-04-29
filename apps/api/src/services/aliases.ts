import { db } from '~/db'
import { userAliases, aliasCollisionQueue, identityUsers } from '~/db/schema'
import { eq, and, sql, inArray } from 'drizzle-orm'
import { normalizeName, nameTokens } from './name-matching'
import type { UserAlias, NewUserAlias, AliasCollisionSource } from '~/db/schema'
import { emitAliasResolved, emitAliasUpdated, emitAliasDeleted } from './alias-events'
import { logger } from '~/logger'

// Levenshtein distance — inline, no dependency
function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]!
      } else {
        dp[i]![j] = 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!)
      }
    }
  }
  return dp[m]![n]!
}

export type ResolvedAlias = {
  identityUserId: string
  alias: string
  aliasNormalized: string
  isPrimary: boolean
  tombstoned: boolean
  deactivatedAt: string | null
}

export type ResolveResult = {
  name: string
  match: ResolvedAlias | null
}

export async function resolveAliases(names: string[]): Promise<ResolveResult[]> {
  if (names.length === 0) return []

  const normalized = names.map(normalizeName)

  const rows = await db
    .select({
      aliasNormalized: userAliases.aliasNormalized,
      identityUserId: userAliases.identityUserId,
      alias: userAliases.alias,
      isPrimary: userAliases.isPrimary,
      status: identityUsers.status,
      updatedAt: identityUsers.updatedAt,
    })
    .from(userAliases)
    .innerJoin(identityUsers, eq(userAliases.identityUserId, identityUsers.id))
    .where(inArray(userAliases.aliasNormalized, normalized))

  const byNormalized = new Map(rows.map((r) => [r.aliasNormalized, r]))

  return names.map((name, i) => {
    const norm = normalized[i]!
    const row = byNormalized.get(norm)
    if (!row) return { name, match: null }
    const tombstoned = row.status === 'inactive'
    return {
      name,
      match: {
        identityUserId: row.identityUserId,
        alias: row.alias,
        aliasNormalized: row.aliasNormalized,
        isPrimary: row.isPrimary,
        tombstoned,
        deactivatedAt: tombstoned ? row.updatedAt.toISOString() : null,
      },
    }
  })
}

export async function createAlias(params: {
  identityUserId: string
  alias: string
  isPrimary: boolean
  source: UserAlias['source']
  actorId?: string
}): Promise<UserAlias> {
  const [created] = await db
    .insert(userAliases)
    .values({
      identityUserId: params.identityUserId,
      alias: params.alias,
      aliasNormalized: normalizeName(params.alias),
      isPrimary: params.isPrimary,
      source: params.source,
      createdBy: params.actorId ?? null,
    })
    .returning()

  emitAliasResolved(created!).catch((err) => {
    logger.error({ err, aliasId: created!.id }, '[alias-events] emitAliasResolved failed')
  })

  return created!
}

export async function renamePrimaryAlias(
  identityUserId: string,
  newName: string,
  actorId?: string,
): Promise<{ demoted: UserAlias; promoted: UserAlias }> {
  return db.transaction(async (tx) => {
    // Step 1: demote the current primary
    const [demoted] = await tx
      .update(userAliases)
      .set({ isPrimary: false })
      .where(
        and(eq(userAliases.identityUserId, identityUserId), eq(userAliases.isPrimary, true)),
      )
      .returning()

    if (!demoted) {
      throw new Error(`No primary alias found for user ${identityUserId}`)
    }

    // Step 2: commit (implicit — within same transaction)
    // Step 3: insert new primary (partial-unique on is_primary is now free)
    const [promoted] = await tx
      .insert(userAliases)
      .values({
        identityUserId,
        alias: newName,
        aliasNormalized: normalizeName(newName),
        isPrimary: true,
        source: 'name_update',
        createdBy: actorId ?? null,
      })
      .returning()

    return { demoted, promoted: promoted! }
  }).then(({ demoted, promoted }) => {
    emitAliasUpdated(demoted, { previousIsPrimary: true }).catch((err) => {
      logger.error({ err, aliasId: demoted.id }, '[alias-events] emitAliasUpdated (demote) failed')
    })
    emitAliasUpdated(promoted, { previousIsPrimary: false }).catch((err) => {
      logger.error({ err, aliasId: promoted.id }, '[alias-events] emitAliasUpdated (promote) failed')
    })
    return { demoted, promoted }
  })
}

export type CollisionResult = {
  exactMatch: UserAlias | null
  fuzzyMatches: Array<{ alias: UserAlias; distance: number; tokenMatch: boolean }>
}

export async function detectCollision(name: string): Promise<CollisionResult> {
  const normalized = normalizeName(name)

  // Exact match check
  const [exact] = await db
    .select()
    .from(userAliases)
    .where(eq(userAliases.aliasNormalized, normalized))
    .limit(1)

  if (exact) {
    return { exactMatch: exact, fuzzyMatches: [] }
  }

  // Load all aliases for fuzzy comparison (bounded by alias count — acceptable for current scale)
  const all = await db.select().from(userAliases)

  const queryTokens = nameTokens(name)
  const fuzzyMatches: CollisionResult['fuzzyMatches'] = []

  for (const row of all) {
    const dist = levenshtein(normalized, row.aliasNormalized)
    const candidateTokens = nameTokens(row.alias)
    const tokenMatch =
      (queryTokens.first === candidateTokens.first ||
        queryTokens.last === candidateTokens.last) &&
      queryTokens.full !== candidateTokens.full
    // Spec §"Confidence + unwind path": fuzzy match is "Levenshtein ≤ 2 OR token-set match".
    // Token-set catches name extensions (Jane Smith vs Jane Smith Jr) where Lev > 2 but the
    // first or last token still aligns — exactly the silent-duplication class we want admins
    // to review. Distance gate alone misses these.
    if (dist <= 2 || tokenMatch) {
      fuzzyMatches.push({ alias: row, distance: dist, tokenMatch })
    }
  }

  fuzzyMatches.sort((a, b) => a.distance - b.distance)
  return { exactMatch: null, fuzzyMatches }
}

export async function enqueueCollision(params: {
  rawName: string
  suggestedIdentityUserId?: string
  source: AliasCollisionSource
  context?: Record<string, unknown>
}): Promise<void> {
  await db.insert(aliasCollisionQueue).values({
    rawName: params.rawName,
    rawNameNormalized: normalizeName(params.rawName),
    suggestedIdentityUserId: params.suggestedIdentityUserId ?? null,
    source: params.source,
    context: params.context ?? {},
    status: 'pending',
  })
}
