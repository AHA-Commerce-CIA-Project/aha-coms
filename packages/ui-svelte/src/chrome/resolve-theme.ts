// Narrow the suite's 'system' | 'light' | 'dark' preference to the
// 'light' | 'dark' value the chrome's toggle icon picks against.
//
// Spec 02 Phase 4 / T41 moves this glue out of every app's layout. The
// chrome components (`ServiceBar`, `MobileTopBar`) accept the wider
// preference union and call `resolveTheme()` internally for the icon
// decision; apps pass their theme state through unchanged. The helper
// is also exported so future consumers (AccountWidget, app-specific
// surfaces) can narrow without re-rolling the conditional.
//
// Resolution rule today: 'system' collapses to 'light' synchronously,
// matching the previous app-side shim's behaviour. The actual DOM
// `dark` class is resolved via `prefers-color-scheme` elsewhere (apps'
// uiState `applyDomClass` step), so the toggle icon stays a default
// rather than a media-query read — keeps SSR + hydration identical.
// A future enhancement could thread matchMedia through with proper
// hydration handling; today's contract matches the prior shim exactly.

export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'system') return 'light'
  return preference
}
