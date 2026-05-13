'use client';

import * as React from 'react';
import { signOut as performSignOut } from './sign-out';

export interface AppSwitcherEntry {
  slug: string;
  label: string;
  url: string;
}

export interface AccountWidgetUser {
  name: string;
  email: string;
  portalRole: string;
  apps: string[];
}

export interface AccountWidgetProps {
  /** Slug of the host app. Must match an entry in `user.apps`. */
  currentApp: string;
  /** Portal origin (e.g. "https://coms.ahacommerce.net"). Used for /profile + sign-out URLs. */
  portalOrigin: string;
  /** Authenticated user. Host loads server-side. Null short-circuits the widget render. */
  user: AccountWidgetUser | null;
  /** Apps for the launcher list. Host derives from user.apps + slug→URL map. */
  appSwitcher: AppSwitcherEntry[];
  /** Where portal redirects after sign-out. Falls back to host origin's "/" if omitted. */
  postLogoutRedirectUri?: string;
  /** Reserved for spec-01 §Visual Spec future notifications slot. */
  notificationsSlot?: React.ReactNode;
}

export function AccountWidget({
  currentApp,
  portalOrigin,
  user,
  appSwitcher,
  postLogoutRedirectUri,
  notificationsSlot,
}: AccountWidgetProps) {
  const [popoverOpen, setPopoverOpen] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const host = window.location?.hostname ?? '';
    const isLocalDev =
      host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
    if (
      isLocalDev &&
      currentApp &&
      user?.apps &&
      !user.apps.includes(currentApp)
    ) {
      // eslint-disable-next-line no-console
      console.warn(
        `[@coms-portal/account-widget-react] currentApp="${currentApp}" not in user.apps`,
        user.apps,
      );
    }
  }, [currentApp, user]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPopoverOpen(false);
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, []);

  if (!user) return null;

  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const trimmedPortalOrigin = portalOrigin.endsWith('/')
    ? portalOrigin.slice(0, -1)
    : portalOrigin;

  const profileHref = `${trimmedPortalOrigin}/profile`;

  const handleSignOut = () => {
    setPopoverOpen(false);
    performSignOut({
      portalOrigin: trimmedPortalOrigin,
      postLogoutRedirectUri:
        postLogoutRedirectUri ?? `${window.location.origin}/`,
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setPopoverOpen((v) => !v)}
        className="relative flex h-[26px] items-center gap-1.5 rounded-md px-2 hover:bg-white/6 transition-colors"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={popoverOpen}
      >
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-light/25 text-[8px] font-bold text-primary-light">
          {initials}
        </div>
        <span className="hidden text-[11px] font-semibold text-primary-light/70 sm:inline">
          {user.name.split(' ')[0]}
        </span>
      </button>

      {popoverOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[75]"
            onClick={() => setPopoverOpen(false)}
            aria-label="Close menu"
            tabIndex={-1}
          />

          <div
            className="fixed top-9 right-3 z-[80] w-64 rounded-xl border border-border bg-card shadow-modal overflow-hidden"
            role="menu"
          >
            <div className="px-4 py-3 border-b border-border">
              <p className="text-sm font-semibold text-foreground truncate">{user.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {user.portalRole}
              </span>
            </div>

            <div className="p-1 border-b border-border">
              <a
                href={profileHref}
                onClick={() => setPopoverOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                role="menuitem"
              >
                Manage account
              </a>
            </div>

            {appSwitcher.length > 0 && (
              <div className="p-1 border-b border-border">
                <div className="px-3 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                  Apps
                </div>
                {appSwitcher.map((app) => {
                  const isActive = app.slug === currentApp;
                  return (
                    <a
                      key={app.slug}
                      href={app.url}
                      onClick={() => setPopoverOpen(false)}
                      role="menuitem"
                      aria-current={isActive ? 'page' : undefined}
                      className={
                        'flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ' +
                        (isActive
                          ? 'bg-accent text-foreground border-l-2 border-primary font-semibold'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground')
                      }
                    >
                      <span>{app.label}</span>
                      {isActive && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                          Here
                        </span>
                      )}
                    </a>
                  );
                })}
              </div>
            )}

            {notificationsSlot && (
              <div className="p-1 border-b border-border">{notificationsSlot}</div>
            )}

            <div className="p-1">
              <button
                type="button"
                onClick={handleSignOut}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                role="menuitem"
              >
                Sign out
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
