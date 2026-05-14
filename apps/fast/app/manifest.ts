import type { MetadataRoute } from 'next';

/*
 * PWA manifest for fast — Spec 05 Phase 9 / T84.
 *
 * FU-10's lesson stands at the manifest layer: portal-web/`/portal/`,
 * heroes-web/`/heroes/`, and fast/`/fast/` are scope-disjoint, so Chrome
 * registers three independent PWAs on the shared `aha-coms.web.app`
 * origin. `start_url`, `scope`, and `id` all rooted at `/fast/` close
 * the scope-overlap collision FU-10 surfaced for the two-PWA case.
 *
 * Next.js's metadata API doesn't auto-prefix manifest values with the
 * basePath (`'/fast'` from next.config.ts) — the values are rendered
 * verbatim into the JSON. Every path the manifest references therefore
 * carries the `/fast/` prefix explicitly: icon `src`, `start_url`,
 * `scope`, `id`.
 *
 * Naming: "AHA Fast" / "Fast" replace the polyrepo-era "AHA COMSS"
 * branding so the home-screen tile + the install registration both
 * read as fast-the-app, not the parent COMS suite.
 */
export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'AHA Fast',
        short_name: 'Fast',
        description: 'Task tracking, routine management, and team collaboration for the AHA team.',
        start_url: '/fast/',
        scope: '/fast/',
        id: '/fast/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0F0E7F',
        theme_color: '#0F0E7F',
        icons: [
            // Two entries per icon — one for `any` (default home-screen badge)
            // and one for `maskable` (adaptive icon on Android). The W3C spec
            // allows the space-separated form but Next.js's MetadataRoute types
            // reject it, so we split them out explicitly. Paths carry the
            // `/fast/` prefix because the manifest layer doesn't auto-prefix.
            { src: '/fast/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/fast/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
            { src: '/fast/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/fast/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        categories: ['business', 'productivity'],
    };
}
