import adapter from 'svelte-adapter-bun'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter(),
    alias: {
      '$lib': './src/lib',
      '$lib/*': './src/lib/*',
      '@coms/shared': '../shared/src',
      '@coms/shared/*': '../shared/src/*',
    },
  },
}

export default config
