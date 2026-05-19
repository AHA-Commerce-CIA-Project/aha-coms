<script lang="ts">
  import '../app.css'
  import { QueryClientProvider, QueryClient } from '@tanstack/svelte-query'
  import { browser } from '$app/environment'

  // Gate every createQuery() callsite on `browser` so queryFns only fire
  // client-side. Server-side rendering renders the loading skeleton; the
  // first hydration tick mounts the queries and fills them in. This silences
  // SvelteKit's "avoid calling fetch eagerly during server-side rendering"
  // warning that otherwise fires once per createQuery on every SSR pass —
  // data that needs SSR-time hydration lives in +layout.server.ts / +page.server.ts
  // load functions instead, where SvelteKit's framework `fetch` handles it.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        enabled: browser,
        staleTime: 1000 * 60,
        refetchOnWindowFocus: true,
      },
    },
  })

  let { children } = $props()
</script>

<QueryClientProvider client={queryClient}>
  {@render children()}
</QueryClientProvider>
