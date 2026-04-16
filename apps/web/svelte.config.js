import adapter from '@sveltejs/adapter-static'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter({
      fallback: 'index.html',
    }),
    alias: {
      '$lib': './src/lib',
      '$lib/*': './src/lib/*',
      '~/*': '../api/src/*',
    },
  },
}

export default config
