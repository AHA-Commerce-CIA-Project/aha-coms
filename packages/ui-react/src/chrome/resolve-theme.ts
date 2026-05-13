export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'system') return 'light';
  return preference;
}
