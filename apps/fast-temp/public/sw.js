// AHA COMSS Service Worker
const CACHE_NAME = 'aha-comss-v48';
const STATIC_ASSETS = [
    '/',
    '/aha-logo.png',
    '/icon-192.png',
    '/icon-512.png',
    '/manifest.webmanifest',
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

// Activate: clean up old caches
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

// Fetch: network-first for API/HTML, cache-first for static assets
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Only handle GET requests on our origin
    if (request.method !== 'GET' || url.origin !== self.location.origin) {
        return;
    }

    // Skip API calls and SSE streams (always go to network)
    if (url.pathname.startsWith('/api/')) {
        return;
    }

    // Skip SSE/streaming requests
    if (request.headers.get('accept')?.includes('text/event-stream')) {
        return;
    }

    // Static assets: cache-first
    if (
        url.pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|css|js)$/) ||
        url.pathname === '/aha-logo.png' ||
        url.pathname.startsWith('/_next/static/')
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

    // HTML pages: network-first with cache fallback
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
                    cached || caches.match('/') || new Response('Offline', { status: 503 })
                )
            )
    );
});
