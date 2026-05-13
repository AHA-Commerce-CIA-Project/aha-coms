'use client';

import * as React from 'react';
import { Sheet, SheetContent } from '../primitives/sheet';
import type { NavItem } from './Sidebar';

export interface SlideOverNavProps {
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
  items?: NavItem[];
  currentPath?: string;
  brand?: React.ReactNode;
  footer?: React.ReactNode;
}

function isActive(href: string, currentPath: string): boolean {
  if (href === '/') return currentPath === '/';
  return currentPath === href || currentPath.startsWith(href + '/');
}

export function SlideOverNav({
  open = false,
  onOpenChange,
  items = [],
  currentPath = '',
  brand,
  footer,
}: SlideOverNavProps) {
  const closeMenu = () => onOpenChange?.(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        showCloseButton={false}
        className="md:hidden w-72 sm:max-w-sm p-0 bg-card flex flex-col gap-0"
      >
        {brand && (
          <div className="flex h-14 items-center border-b border-border px-4 shrink-0">
            {brand}
          </div>
        )}

        <nav
          className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5"
          aria-label="Application navigation"
        >
          {items.map((item) => {
            const active = isActive(item.href, currentPath);
            const Icon = item.icon;
            return (
              <a
                key={item.href}
                href={item.href}
                onClick={closeMenu}
                aria-current={active ? 'page' : undefined}
                className={
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all duration-150 hover:bg-primary/8 hover:text-foreground ' +
                  (active ? 'sidebar-link-active' : '')
                }
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span className="leading-none">{item.label}</span>
              </a>
            );
          })}
        </nav>

        {footer && (
          <div className="border-t border-border p-2 shrink-0">{footer}</div>
        )}
      </SheetContent>
    </Sheet>
  );
}
