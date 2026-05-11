import { Elysia, t } from 'elysia'
import { requireRole } from '../middleware/rbac'
import * as categoriesRepo from '../repositories/categories'
import { withRLS } from '../repositories/base'
import type { AuthUser } from '../middleware/auth'

type Ctx = { authUser: AuthUser }

const toggleSchema = t.Object({
  isActive: t.Boolean(),
})

export const categoriesRoute = new Elysia({ prefix: '/categories' })

  // GET /categories — list all with translations (any authenticated user)
  .get('/', async ({ query, ...c }) => {
    const { authUser: actor } = c as unknown as Ctx
    const locale = query.locale

    const categories = await withRLS(actor, (db) => categoriesRepo.listCategories(db))

    const data = categories.map((cat) => {
      const translation = locale
        ? cat.translations.find((tr) => tr.locale === locale)
        : undefined

      return {
        id: cat.id,
        code: cat.code,
        name: translation?.name ?? cat.defaultName,
        description: translation?.description ?? cat.description,
        icon: cat.icon,
        requiresScreenshot: cat.requiresScreenshot,
        isActive: cat.isActive,
      }
    })

    return { success: true, data, error: null }
  }, {
    query: t.Object({
      locale: t.Optional(t.String()),
    }),
  })

  // PATCH /categories/:id — toggle active (admin only)
  .patch('/:id', async ({ params, body, set, ...c }) => {
    const { authUser: actor } = c as unknown as Ctx
    requireRole('admin')(c as unknown as { authUser: AuthUser })

    const updated = await withRLS(actor, async (db) => {
      const existing = await categoriesRepo.getCategoryById(params.id, db)
      if (!existing) {
        return null
      }
      return categoriesRepo.toggleCategoryActive(params.id, body.isActive, db)
    })

    if (!updated) {
      set.status = 404
      return { success: false, data: null, error: { code: 'NOT_FOUND', message: `Category not found: ${params.id}` } }
    }

    return { success: true, data: updated, error: null }
  }, { body: toggleSchema })
