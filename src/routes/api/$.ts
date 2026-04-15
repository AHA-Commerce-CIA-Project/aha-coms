import { createFileRoute } from '@tanstack/react-router'
import { app } from '~/server/index'

export const Route = createFileRoute('/api/$')({
  server: {
    handlers: {
      GET: ({ request }) => app.handle(request),
      POST: ({ request }) => app.handle(request),
      PUT: ({ request }) => app.handle(request),
      PATCH: ({ request }) => app.handle(request),
      DELETE: ({ request }) => app.handle(request),
    },
  },
})
