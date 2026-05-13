'use client';

import * as React from 'react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}

export interface SidebarProps {
  sections?: NavSection[];
  currentPath?: string;
  collapsed?: boolean;
  onCollapsedChange?: (next: boolean) => void;
  logo?: (args: { collapsed: boolean }) => React.ReactNode;
  footer?: (args: { collapsed: boolean }) => React.ReactNode;
}

function isActive(href: string, currentPath: string): boolean {
  if (href === '/') return currentPath === '/';
  return currentPath === href || currentPath.startsWith(href + '/');
}

export function Sidebar({
  sections = [],
  currentPath = '',
  collapsed = true,
  onCollapsedChange,
  logo,
  footer,
}: SidebarProps) {
  return (
    <aside
      className={
        'fixed top-9 left-0 z-40 hidden md:flex h-[calc(100vh-2.25rem)] flex-col transition-[width] duration-200 bg-card border-r border-border ' +
        (collapsed ? 'w-16' : 'w-64')
      }
      onMouseEnter={() => onCollapsedChange?.(false)}
      onMouseLeave={() => onCollapsedChange?.(true)}
      role="navigation"
      aria-label="Main navigation"
    >
      {logo && (
        <div
          className={
            'flex h-14 items-center border-b border-border ' +
            (collapsed ? 'justify-center px-0' : 'px-4')
          }
        >
          {logo({ collapsed })}
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {sections.map((section, sectionIdx) => (
          <React.Fragment key={sectionIdx}>
            {section.label && sectionIdx > 0 && (
              <div className={'pt-4 pb-1.5 ' + (collapsed ? 'px-1' : 'px-3')}>
                {!collapsed ? (
                  <span className="section-label text-muted-foreground/50">
                    {section.label}
                  </span>
                ) : (
                  <div className="border-t border-border" />
                )}
              </div>
            )}
            {section.items.map((item) => {
              const active = isActive(item.href, currentPath);
              const Icon = item.icon;
              return (
                <a
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all duration-150 hover:bg-primary/8 hover:text-foreground ' +
                    (collapsed ? 'justify-center px-0 ' : '') +
                    (active ? 'sidebar-link-active' : '')
                  }
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  {!collapsed && <span className="leading-none">{item.label}</span>}
                </a>
              );
            })}
          </React.Fragment>
        ))}
      </nav>

      {footer && (
        <div className="border-t border-border p-2">{footer({ collapsed })}</div>
      )}
    </aside>
  );
}
