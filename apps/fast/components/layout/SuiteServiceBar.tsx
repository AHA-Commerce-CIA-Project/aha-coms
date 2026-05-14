'use client';

import { ServiceBar, type ServiceItem } from '@coms-portal/ui-react/chrome';
import { AccountWidget, type AppSwitcherEntry } from '@coms-portal/account-widget-react';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth/use-auth';

/*
 * Suite-wide ServiceBar — the cross-app cookie crumb (portal / heroes /
 * fast) that sits above fast's in-app TopNav on desktop. Hidden on
 * mobile per ServiceBar's own `hidden md:flex`.
 *
 * Phase 6 / T74 — dynamic appCatalog flowing through from portal-api's
 * /api/userinfo via /api/auth/me. The portal-hub prepend lives in
 * `apps/portal-api/src/routes/userinfo.ts` per T47 Finding 5 — fast
 * iterates without special-casing. The static fallback is kept as the
 * pre-auth render path so the strip never looks empty during the
 * first paint.
 *
 * AccountWidget is mounted into ServiceBar's `right` slot. Fast's
 * TopNav still carries a fast-specific profile menu (Profile Settings,
 * Changelog) — the two profiles serve different purposes (cross-app
 * launcher + sign-out vs. in-app destinations) and coexisting through
 * Phase 6 is the deliberate hybrid-mount call. T75's visual-parity
 * pass decides whether the two paths collapse in a follow-up.
 */

const STATIC_FALLBACK: ServiceItem[] = [
    { slug: 'portal', label: 'COMS', href: '/portal' },
    { slug: 'heroes', label: 'AHA Heroes', href: '/heroes/' },
    { slug: 'fast', label: 'AHA Fast', href: '/fast' },
];

const PORTAL_ORIGIN =
    process.env.NEXT_PUBLIC_PORTAL_ORIGIN || 'https://aha-coms.web.app';

export function SuiteServiceBar() {
    const { theme, toggleTheme } = useTheme();
    const { user, appCatalog } = useAuth();

    const services: ServiceItem[] = appCatalog.length > 0
        ? appCatalog.map((app) => ({
              slug: app.slug,
              label: app.label,
              href: app.url,
          }))
        : STATIC_FALLBACK;

    const appSwitcher: AppSwitcherEntry[] = appCatalog.length > 0
        ? appCatalog.map((app) => ({
              slug: app.slug,
              label: app.label,
              url: app.url,
          }))
        : [];

    const accountWidget = user
        ? (
              <AccountWidget
                  currentApp="fast"
                  portalOrigin={PORTAL_ORIGIN}
                  user={{
                      name: user.name,
                      email: user.email,
                      portalRole: user.portalRole,
                      apps: [...user.apps],
                  }}
                  appSwitcher={appSwitcher}
              />
          )
        : null;

    return (
        <ServiceBar
            services={services}
            currentApp="fast"
            theme={theme}
            onToggleTheme={toggleTheme}
            right={accountWidget}
        />
    );
}
