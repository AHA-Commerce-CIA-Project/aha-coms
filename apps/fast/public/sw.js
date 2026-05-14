// AHA Fast service worker — Spec 05 Phase 9 / T85.
//
// Scope inherits from the manifest (start_url + scope both `/fast/`),
// so this worker only intercepts fetches under `/fast/*`. The
// `aha-coms.web.app` origin hosts three independent PWAs (portal at
// `/portal/`, heroes at `/heroes/`, fast at `/fast/`); each one's
// worker is scope-disjoint per FU-10's structural fix.
//
// Every cached path is `/fast/`-prefixed because Firebase Hosting
// preserves the prefix verbatim into the Cloud Run service — the
// service worker fetches what the browser fetches.
const CACHE_NAME = 'aha-fast-v1';
const STATIC_ASSETS = [
    '/fast/',
    '/fast/aha-logo.png',
    '/fast/icon-192.png',
    '/fast/icon-512.png',
    '/fast/manifest.webmanifest',
];

// Install: cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS).catch((err) => {
                console.warn('SW cache.addAll failed:', err);
            });
        })
    );
    self.skipWaiting();
});

// Activate: clean up old caches, including the pre-T85 `aha-comss-v*`
// cache shape that lived on the unprefixed paths before basePath flipped.
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

// Fetch: network-first for HTML, cache-first for static assets.
// API calls + SSE streams skip the worker entirely so authenticated
// surfaces never serve stale data.
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Only handle GET requests on our origin
    if (request.method !== 'GET' || url.origin !== self.location.origin) {
        return;
    }

    // Skip API calls — pass through to network. Cookied auth + dynamic
    // data don't survive caching at the worker layer.
    if (url.pathname.startsWith('/fast/api/')) {
        return;
    }

    // Skip SSE/streaming requests
    if (request.headers.get('accept')?.includes('text/event-stream')) {
        return;
    }

    // Static assets: cache-first. Matches both the explicit STATIC_ASSETS
    // entries above and any incidental image/font/script under /fast/.
    if (
        url.pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|css|js)$/) ||
        url.pathname === '/fast/aha-logo.png' ||
        url.pathname.startsWith('/fast/_next/static/')
    ) {
        event.respondWith(
            caches.match(request).then((cached) => {
                return cached || fetch(request).then((response) => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                    }
                    return response;
                });
            })
        );
        return;
    }

    // HTML pages: network-first with cache fallback. Offline returns
    // the cached `/fast/` shell when nothing better matches.
    event.respondWith(
        fetch(request)
            .then((response) => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                }
                return response;
            })
            .catch(() =>
                caches.match(request).then((cached) =>
                    cached || caches.match('/fast/') || new Response('Offline', { status: 503 })
                )
            )
    );
});
