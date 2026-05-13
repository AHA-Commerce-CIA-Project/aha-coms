'use client';

import * as React from 'react';
import type { NavItem } from './Sidebar';

export interface MobileBottomNavProps {
  items?: NavItem[];
  currentPath?: string;
}

function isActive(href: string, currentPath: string): boolean {
  if (href === '/') return currentPath === '/';
  return currentPath === href || currentPath.startsWith(href + '/');
}

export function MobileBottomNav({ items = [], currentPath = '' }: MobileBottomNavProps) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex items-stretch md:hidden bg-[#0d1229]/85 backdrop-blur-xl border-t border-white/10 h-[calc(4rem+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)]"
      aria-label="Mobile navigation"
    >
      {items.map((item) => {
        const active = isActive(item.href, currentPath);
        const Icon = item.icon;
        return (
          <a
            key={item.href}
            href={item.href}
            className={
              'relative flex flex-1 flex-col items-center justify-center gap-1 min-h-[44px] transition-colors duration-200 tap-active ' +
              (active ? 'text-primary-light bnav-active' : 'text-white/40 hover:text-white/70')
            }
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span className="text-[10px] font-semibold leading-none tracking-wide">
              {item.label}
            </span>
          </a>
        );
      })}
    </nav>
  );
}
