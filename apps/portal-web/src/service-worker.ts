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

  // Skip API calls — always go to network
  if (url.pathname.startsWith('/api')) return

  // Skip /heroes/** — the single-origin migration mounts heroes-web at
  // /heroes/*, but portal-web's SW scope is `/`, so it would otherwise
  // intercept every heroes navigation. The wrapped `fetch(event.request)`
  // round-trip drops Set-Cookie before the browser commits it (observed at
  // T30 — heroes' broker-exchange 303 set `coms_session=…; Path=/` and the
  // browser never persisted it, producing a portal↔heroes redirect loop).
  // CP4 Finding 2 carried this caveat forward; T30 forced the fix.
  if (url.pathname === '/heroes' || url.pathname.startsWith('/heroes/')) return

  event.respondWith(
    caches.match(event.request).then((cached) => cached ?? fetch(event.request))
  )
})
