export function buildSearchParams(
  updates: Record<string, string | null | undefined>,
  base?: URLSearchParams,
) {
  const params = new URLSearchParams(base)

  for (const [key, value] of Object.entries(updates)) {
    if (value == null || value === '') params.delete(key)
    else params.set(key, value)
  }

  return params.toString()
}
