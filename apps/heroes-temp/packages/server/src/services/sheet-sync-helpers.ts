export function buildHeaderIndex(
  headers: string[],
  headerMap: Record<string, string>,
): Record<string, number> {
  const result: Record<string, number> = {}
  for (const [key, label] of Object.entries(headerMap)) {
    const idx = headers.indexOf(label)
    if (idx !== -1) result[key] = idx
  }
  return result
}

export function parseTimestamp(value: string): Date {
  const matchDateTime = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/)
  if (matchDateTime) {
    const [, month, day, year, hour, minute, second] = matchDateTime
    return new Date(
      Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
      ),
    )
  }

  const matchDateOnly = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (matchDateOnly) {
    const [, month, day, year] = matchDateOnly
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  }

  const num = Number(value)
  if (!isNaN(num) && num > 25000 && num < 100000) {
    const SHEETS_EPOCH = Date.UTC(1899, 11, 30)
    const MS_PER_DAY = 86_400_000
    return new Date(SHEETS_EPOCH + num * MS_PER_DAY)
  }

  const fallback = new Date(value)
  if (!isNaN(fallback.getTime())) return fallback
  throw new Error(`Cannot parse timestamp: "${value}"`)
}

export function parseReward(value: string): { name: string; cost: number } {
  const match = value.match(/^(.+?)\s*\((\d+)\)$/)
  if (!match) throw new Error(`Cannot parse reward: "${value}"`)
  return { name: match[1].trim(), cost: Number(match[2]) }
}
