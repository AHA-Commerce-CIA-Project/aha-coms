'use client';

import * as React from 'react';
import { resolveTheme, type ThemePreference } from './resolve-theme';

export interface ServiceItem {
  slug: string;
  label: string;
  href?: string;
  formAction?: string;
}

export interface ServiceBarProps {
  services?: ServiceItem[];
  currentApp: string;
  theme?: ThemePreference;
  onToggleTheme?: () => void;
  right?: React.ReactNode;
}

export function ServiceBar({
  services = [],
  currentApp,
  theme = 'light',
  onToggleTheme,
  right,
}: ServiceBarProps) {
  const resolvedTheme = resolveTheme(theme);

  return (
    <div className="fixed top-0 left-0 right-0 z-[70] h-9 hidden md:flex items-center bg-gradient-to-r from-deep-navy to-primary-dark border-b border-white/8 px-3 gap-1">
      {services.map((svc) => {
        const isActive = svc.slug === currentApp;
        if (isActive) {
          return (
            <div
              key={svc.slug}
              className="flex h-6 items-center px-2.5 rounded text-[11px] font-semibold bg-white/10 text-white cursor-default select-none"
            >
              {svc.label}
            </div>
          );
        }
        if (svc.formAction) {
          return (
            <form key={svc.slug} method="POST" action={svc.formAction} className="contents">
              <button
                type="submit"
                className="flex h-6 items-center px-2.5 rounded text-[11px] font-semibold text-white/45 hover:text-white/80 hover:bg-white/6 transition-colors tap-active"
              >
                {svc.label}
              </button>
            </form>
          );
        }
        return (
          <a
            key={svc.slug}
            href={svc.href}
            className="flex h-6 items-center px-2.5 rounded text-[11px] font-semibold text-white/45 hover:text-white/80 hover:bg-white/6 transition-colors"
          >
            {svc.label}
          </a>
        );
      })}

      <div className="flex-1" />

      {onToggleTheme && (
        <button
          type="button"
          onClick={onToggleTheme}
          className="flex h-[26px] w-[26px] items-center justify-center rounded-md text-primary-light/60 hover:text-primary-light hover:bg-white/6 transition-colors"
          aria-label={
            resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
          }
        >
          {resolvedTheme === 'dark' ? (
            <svg
              className="h-3.5 w-3.5"
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
              className="h-3.5 w-3.5"
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

      {right}
    </div>
  );
}
