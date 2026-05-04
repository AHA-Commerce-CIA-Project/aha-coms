import { Elysia, t } from 'elysia'
import { requireAppToken } from '~/middleware/app-token'
import { getTaxonomyEntriesForApp } from '~/services/taxonomies'

export const taxonomiesRoutes = new Elysia({ prefix: '/taxonomies' })
  .use(requireAppToken())

  // GET /api/taxonomies/sync
  // Returns every entry for every taxonomy the calling app's manifest subscribes to.
  .get(
    '/sync',
    async ({ app }) => {
      const result = await getTaxonomyEntriesForApp(app.id)
      return result
    },
    {
      response: {
        200: t.Object({
          taxonomies: t.Array(
            t.Object({
              taxonomyId: t.String(),
              entries: t.Array(
                t.Object({
                  key: t.String(),
                  value: t.String(),
                  metadata: t.Union([t.Record(t.String(), t.Unknown()), t.Null()]),
                }),
              ),
            }),
          ),
          syncedAt: t.String(),
        }),
      },
    },
  )
