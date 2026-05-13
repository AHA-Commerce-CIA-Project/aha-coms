/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker'

// Heroes-web's tsconfig.json carries an explicit `include` that pulls
// this file into the project's main worker-vs-DOM-conflicted lib set;
// the `/// <reference lib="webworker" />` above isn't enough to retype
// `self` on its own. The cast below makes the SW lifecycle handlers
// type-clean without changing runtime behaviour.
const sw = self as unknown as ServiceWorkerGlobalScope

const CACHE = `heroes-cache-${version}`
const ASSETS = [...build, ...files]

sw.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS))
  )
})

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
    )
  )
})

sw.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  const url = new URL(event.request.url)

  // Skip API calls — always go to network. Heroes-api lives at
  // /heroes/api/*; the SW's natural scope is /heroes/ (paths.base in
  // svelte.config.js sets that), so this guard catches the per-host
  // case where SvelteKit registers the SW at /heroes/service-worker.js
  // and `/heroes/api/*` falls inside its claim radius.
  if (url.pathname.startsWith('/heroes/api')) return

  event.respondWith(
    caches.match(event.request).then((cached) => cached ?? fetch(event.request))
  )
})
