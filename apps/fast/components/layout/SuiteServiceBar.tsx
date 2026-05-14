'use client';

import { ServiceBar, type ServiceItem } from '@coms-portal/ui-react/chrome';
import { useTheme } from '@/lib/theme-context';

/*
 * Suite-wide ServiceBar — the cross-app cookie crumb (portal / heroes /
 * fast) that sits above fast's in-app TopNav on desktop. Hidden on
 * mobile per ServiceBar's own `hidden md:flex`.
 *
 * Phase 6 hybrid mount (T72 + T73 + T74 + T75): the services list is
 * static here for now — every signed-in fast user reaches portal +
 * heroes + fast at the same single-origin URLs, and the portal-hub
 * prepend lives in `apps/portal-api/src/routes/userinfo.ts` per T47
 * Finding 5. A future commit can lift this to `data.appCatalog` from
 * loadFastAuthUser if other apps onboard onto the suite.
 *
 * AccountWidget mount is deliberately deferred — fast's in-app TopNav
 * already carries notifications + a profile menu that handles
 * fast-specific destinations (Profile Settings, Changelog), and adding
 * a second avatar in the ServiceBar would surface two profile entry
 * points. T74's appCatalog-wiring window is the right moment to
 * deduplicate the two paths.
 */

const SUITE_SERVICES: ServiceItem[] = [
    { slug: 'portal', label: 'COMS', href: '/portal' },
    { slug: 'heroes', label: 'AHA Heroes', href: '/heroes/' },
    { slug: 'fast', label: 'AHA Fast', href: '/fast' },
];

export function SuiteServiceBar() {
    const { theme, toggleTheme } = useTheme();
    return (
        <ServiceBar
            services={SUITE_SERVICES}
            currentApp="fast"
            theme={theme}
            onToggleTheme={toggleTheme}
        />
    );
}
