import { db } from '~/db'
import { userAliases, aliasCollisionQueue, identityUsers } from '~/db/schema'
import { eq, and, sql, inArray } from 'drizzle-orm'
import { normalizeName } from './name-matching'
import type { UserAlias, NewUserAlias, AliasCollisionSource } from '~/db/schema'
import { emitAliasResolved, emitAliasUpdated, emitAliasDeleted } from './alias-events'
import { logger } from '~/logger'

// ---------------------------------------------------------------------------
// T2.5 — pg_trgm similarity threshold for fuzzy alias collision detection.
//
// Calibration: the former Levenshtein ≤ 2 gate on normalized names (avg ~10
// chars) corresponds to trigram similarity ≈ 0.50–0.65 for single-char edits
// and ≈ 0.35–0.50 for two-char edits. The token-set extension ("Jane Smith"
// vs "Jane Smith Jr", Lev=3) still produces similarity ≈ 0.60 because most
// trigrams are shared. A threshold of 0.35 is therefore slightly *permissive*
// relative to the old Lev≤2 gate (captures a few more near-misses) while
// remaining strictly below random noise. If the collision queue fills with
// false positives, raise to 0.45; if it misses known near-duplicates, lower
// to 0.30. Tested against the fixture pairs in aliases.test.ts.
// ---------------------------------------------------------------------------
const SIMILARITY_THRESHOLD = 0.35

// Maximum fuzzy matches returned per query — same effective cap as before
// (the old full-table scan returned all matches, but the alias table is small;
// 25 is a pragmatic ceiling that keeps the collision-review UI manageable).
const FUZZY_LIMIT = 25

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
  // distance: synthetic value derived from pg_trgm similarity (distance = 1 - similarity),
  //   preserved for API contract compatibility. tokenMatch: always false in the new
  //   implementation — pg_trgm at threshold 0.35 subsumes both the old Lev≤2 gate and
  //   the token-set extension; callers should not depend on tokenMatch=true.
  fuzzyMatches: Array<{ alias: UserAlias; distance: number; tokenMatch: boolean }>
}

// Row shape returned by the pg_trgm SQL query (snake_case from Postgres)
type TrgmRow = {
  id: string
  alias_normalized: string
  alias: string
  identity_user_id: string
  is_primary: boolean
  source: string
  created_at: Date
  created_by: string | null
  similarity: number
}

export async function detectCollision(name: string): Promise<CollisionResult> {
  const normalized = normalizeName(name)

  // Exact match check — unchanged, index-backed by user_aliases_alias_normalized_uniq
  const [exact] = await db
    .select()
    .from(userAliases)
    .where(eq(userAliases.aliasNormalized, normalized))
    .limit(1)

  if (exact) {
    return { exactMatch: exact, fuzzyMatches: [] }
  }

  // T2.5: Single pg_trgm similarity query backed by GIN index
  // idx_user_aliases_alias_normalized_gin_trgm (live in prod as of Wave 1).
  //
  // The % operator uses the GIN index for fast candidate pre-filtering; the
  // explicit similarity() >= THRESHOLD guard ensures the threshold is always
  // respected regardless of the session-level pg_trgm.similarity_threshold
  // setting. ORDER BY similarity DESC returns best matches first.
  const rows = await db.execute<TrgmRow>(sql`
    SELECT
      id,
      alias_normalized,
      alias,
      identity_user_id,
      is_primary,
      source,
      created_at,
      created_by,
      similarity(alias_normalized, ${normalized}) AS similarity
    FROM user_aliases
    WHERE alias_normalized % ${normalized}
      AND similarity(alias_normalized, ${normalized}) >= ${SIMILARITY_THRESHOLD}
    ORDER BY similarity DESC
    LIMIT ${FUZZY_LIMIT}
  `)

  const fuzzyMatches: CollisionResult['fuzzyMatches'] = rows.map((row) => {
    const alias: UserAlias = {
      id: row.id,
      identityUserId: row.identity_user_id,
      alias: row.alias,
      aliasNormalized: row.alias_normalized,
      isPrimary: row.is_primary,
      source: row.source as UserAlias['source'],
      createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
      createdBy: row.created_by ?? null,
    }
    return {
      alias,
      // Synthetic distance: 1 - similarity, rounded to 2 dp for readability.
      // Consumers that previously used `distance` for display can treat this as
      // a 0–1 dissimilarity score (0 = identical, 1 = no overlap).
      distance: Math.round((1 - row.similarity) * 100) / 100,
      tokenMatch: false,
    }
  })

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
