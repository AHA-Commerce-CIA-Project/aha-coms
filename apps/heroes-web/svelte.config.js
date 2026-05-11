import adapter from 'svelte-adapter-bun'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter(),
    alias: {
      '$lib': './src/lib',
      '$lib/*': './src/lib/*',
      '@coms-portal/heroes-shared': '../../packages/heroes-shared/src',
      '@coms-portal/heroes-shared/*': '../../packages/heroes-shared/src/*',
    },
  },
}

export default config
