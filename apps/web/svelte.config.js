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
      // @coms-portal/api package exports into apps/api source files, which
      // use `~/*` internally. Web code MUST NOT import via `~/*` — cross
      // into the api package via `@coms-portal/api/*` paths registered in
      // apps/api/package.json#exports so the door stays narrow.
      '~/*': '../api/src/*',
    },
  },
}

export default config
