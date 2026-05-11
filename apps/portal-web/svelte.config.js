import adapter from '@sveltejs/adapter-node'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter({
      out: 'build',
    }),
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
