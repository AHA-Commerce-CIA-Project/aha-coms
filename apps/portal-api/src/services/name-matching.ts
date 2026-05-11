export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function nameTokens(name: string): { first: string; last: string; full: string } {
  const normalized = normalizeName(name)
  const parts = normalized.split(' ')
  return {
    first: parts[0] ?? '',
    last: parts.length > 1 ? parts[parts.length - 1]! : '',
    full: normalized,
  }
}

export function matchScore(a: string, b: string): number {
  const at = nameTokens(a)
  const bt = nameTokens(b)

  if (at.full === bt.full) return 2
  if (at.first === bt.first && at.last === bt.last) return 1
  if ((!at.last || !bt.last) && at.first === bt.first) return 1

  return 0
}

export function findBestMatch<T extends { id: string; name: string }>(
  query: string,
  candidates: T[],
): { match: T | null; score: number; ambiguous: boolean } {
  let match: T | null = null
  let score = 0
  let ambiguous = false

  for (const candidate of candidates) {
    const s = matchScore(query, candidate.name)
    if (s > score) {
      score = s
      match = candidate
      ambiguous = false
    } else if (s === score && s > 0 && candidate.id !== match?.id) {
      ambiguous = true
    }
  }

  return { match, score, ambiguous }
}
