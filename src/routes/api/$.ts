import { createAPIFileRoute } from '@tanstack/react-start/api'
import { app } from '~/server/index'

export const APIRoute = createAPIFileRoute('/api/$')({
  GET: ({ request }) => app.handle(request),
  POST: ({ request }) => app.handle(request),
  PUT: ({ request }) => app.handle(request),
  PATCH: ({ request }) => app.handle(request),
  DELETE: ({ request }) => app.handle(request),
})
