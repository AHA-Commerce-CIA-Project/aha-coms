'use client';

import * as React from 'react';
import { resolveTheme, type ThemePreference } from './resolve-theme';

export interface MobileTopBarProps {
  theme?: ThemePreference;
  onToggleTheme?: () => void;
  brand?: React.ReactNode;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  right?: React.ReactNode;
}

export function MobileTopBar({
  theme = 'light',
  onToggleTheme,
  brand,
  leading,
  trailing,
  right,
}: MobileTopBarProps) {
  const resolvedTheme = resolveTheme(theme);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex h-14 items-center justify-between px-4 md:hidden bg-[#0d1229]/85 backdrop-blur-xl border-b border-white/10">
      <div className="flex items-center gap-2">
        {leading}
        {brand}
      </div>

      <div className="flex items-center gap-1">
        {onToggleTheme && (
          <button
            type="button"
            onClick={onToggleTheme}
            className="flex h-10 w-10 items-center justify-center rounded-full text-white/60 hover:bg-white/8 hover:text-white transition-colors"
            aria-label={
              resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
            }
          >
            {resolvedTheme === 'dark' ? (
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
            ) : (
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
        )}

        {trailing}
        {right}
      </div>
    </header>
  );
}
