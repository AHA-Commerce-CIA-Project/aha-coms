import Elysia from 'elysia'

/** Prevent service worker from caching API responses (Ghost Login prevention) */
export const apiCacheControl = new Elysia({ name: 'api-cache-control' })
  .onAfterHandle(({ set }) => {
    set.headers['cache-control'] = 'no-cache, no-store, must-revalidate'
  })
