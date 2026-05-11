<script lang="ts">
  import '../app.css'
  import { QueryClientProvider, QueryClient } from '@tanstack/svelte-query'

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
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
