/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker'

const CACHE = `cache-${version}`
const ASSETS = [...build, ...files]

self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS))
  )
})

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
    )
  )
})

self.addEventListener('fetch', (event: FetchEvent) => {
  if (event.request.method !== 'GET') return

  const url = new URL(event.request.url)

  // Skip API calls — always go to network. Portal-api lives at /api/** on
  // the shared origin (Firebase Hosting routes that namespace to portal-api
  // regardless of portal-web's base path). Wrapping these in caches.match
  // would serve stale userinfo / session data.
  if (url.pathname.startsWith('/api/') || url.pathname === '/api') return

  // FU-10 retired the explicit /heroes skip: portal-web's SW scope is now
  // /portal/ (manifest.json + svelte.config.js paths.base), so the browser
  // does not invoke this worker for fetches from /heroes/* pages. The
  // T30-era CP4 Finding 2 (the fetch round-trip dropped Set-Cookie before
  // the browser committed it) closes structurally with the scope split.

  event.respondWith(
    caches.match(event.request).then((cached) => cached ?? fetch(event.request))
  )
})
