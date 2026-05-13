import adapter from '@sveltejs/adapter-node'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter({
      out: 'build',
    }),
    // Portal-web mounts at /portal/ on the shared Firebase Hosting origin
    // (FU-10). Heroes lives at /heroes/, future apps at /<slug>/. The /
    // root is a Firebase Hosting 301 redirect to /portal/ — see firebase.json.
    // FU-10 origin: portal-web's prior manifest defaulted scope to / which
    // transitively blocked heroes-web (and future apps) from installing as
    // distinct PWAs on the same origin. Mounting portal at /portal/ scopes
    // its manifest to /portal/, freeing the rest of the origin for sibling
    // apps' install registrations.
    paths: {
      base: '/portal',
    },
    alias: {
      '$lib': './src/lib',
      '$lib/*': './src/lib/*',
      // Transitive-resolution only. svelte-check follows imports through
      // @coms-portal/portal-api package exports into apps/portal-api source
      // files, which use `~/*` internally. Web code MUST NOT import via
      // `~/*` — cross into the api package via `@coms-portal/portal-api/*`
      // paths registered in apps/portal-api/package.json#exports so the door
      // stays narrow.
      '~/*': '../portal-api/src/*',
    },
  },
}

export default config
