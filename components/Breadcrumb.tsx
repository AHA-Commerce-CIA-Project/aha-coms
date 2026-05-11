'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';

interface Crumb {
  label: string;
  href?: string;
}

function getBreadcrumbs(pathname: string, searchParams: URLSearchParams): Crumb[] {
  // Tasks group — three sub-pages share the Tasks parent
  if (pathname === '/tasks') return [{ label: 'Tasks', href: '/tasks' }, { label: 'My Tasks' }];
  if (pathname === '/nexus') return [{ label: 'Tasks', href: '/tasks' }, { label: 'Task Queue' }];
  if (pathname === '/orbit') return [{ label: 'Tasks', href: '/tasks' }, { label: 'AHA Orbit' }];
  if (pathname === '/orbit/manage')
    return [
      { label: 'Tasks', href: '/tasks' },
      { label: 'AHA Orbit', href: '/orbit' },
      { label: 'Manage' },
    ];
  if (pathname === '/orbit/analytics')
    return [
      { label: 'Tasks', href: '/tasks' },
      { label: 'AHA Orbit', href: '/orbit' },
      { label: 'Analytics' },
    ];

  // Single-page sections
  if (pathname === '/fast') return [{ label: 'Dashboard' }];
  if (pathname === '/messages') return [{ label: 'Messages' }];
  if (pathname === '/channels') return [{ label: 'Channels' }];
  if (pathname === '/later') return [{ label: 'Later' }];
  if (pathname === '/profile') return [{ label: 'Profile' }];
  if (pathname === '/changelog') return [{ label: 'Changelog' }];
  if (pathname === '/team-inbox') return [{ label: 'Task Inbox' }];
  if (pathname === '/my-request') return [{ label: 'My Request' }];
  if (pathname === '/request') return [{ label: 'Request Form' }];
  if (pathname === '/analytics') return [{ label: 'Analytics' }];
  if (pathname === '/activity-log') return [{ label: 'Activity Log' }];
  if (pathname.startsWith('/track')) return [{ label: 'Track Request' }];

  // Users + tabs
  if (pathname === '/users') {
    const tab = searchParams.get('tab');
    if (tab === 'teams') return [{ label: 'Users', href: '/users' }, { label: 'Teams' }];
    if (tab === 'roles') return [{ label: 'Users', href: '/users' }, { label: 'Roles' }];
    return [{ label: 'Users' }];
  }

  return [];
}

export function Breadcrumb() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const crumbs = getBreadcrumbs(pathname, searchParams);
  if (crumbs.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className="px-6 pt-3 pb-0 flex items-center gap-1.5 text-sm w-fit"
    >
      <Link
        href="/fast"
        className="text-slate-400 hover:text-indigo-600 transition-colors flex-shrink-0 inline-flex items-center"
        aria-label="Home"
      >
        <Home className="w-4 h-4" />
      </Link>
      <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
      {crumbs.map((c, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={`${c.label}-${i}`} className="flex items-center gap-1.5">
            {c.href && !isLast ? (
              <Link
                href={c.href}
                className="text-indigo-600 hover:text-indigo-700 hover:underline font-semibold transition-colors"
              >
                {c.label}
              </Link>
            ) : (
              <span className={isLast ? 'text-slate-500' : 'text-indigo-600 font-semibold'}>
                {c.label}
              </span>
            )}
            {!isLast && <ChevronRight className="w-3.5 h-3.5 text-slate-300" />}
          </span>
        );
      })}
    </nav>
  );
}
