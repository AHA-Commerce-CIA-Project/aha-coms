import { Elysia } from 'elysia'
import { updateSettingSchema } from '@coms/shared/schemas'
import * as settingsService from '../services/settings'
import type { AuthUser } from '../middleware/auth'

type Ctx = { authUser: AuthUser }

export const settingsRoute = new Elysia({ prefix: '/settings' })

  // GET / — list all settings (admin only)
  .get('/', async ({ set, ...c }) => {
    const { authUser: actor } = c as unknown as Ctx

    try {
      const data = await settingsService.listSettings({ actor })
      return { success: true, data, error: null }
    } catch (err) {
      if (err instanceof settingsService.InsufficientRoleError) {
        set.status = 403
        return { success: false, data: null, error: { code: 'FORBIDDEN', message: err.message } }
      }
      throw err
    }
  })

  // PATCH / — update a setting (admin only)
  .patch('/', async ({ body, set, ...c }) => {
    const { authUser: actor } = c as unknown as Ctx

    try {
      const data = await settingsService.updateSetting(body, { actor })
      return { success: true, data, error: null }
    } catch (err) {
      if (err instanceof settingsService.InsufficientRoleError) {
        set.status = 403
        return { success: false, data: null, error: { code: 'FORBIDDEN', message: err.message } }
      }
      throw err
    }
  }, { body: updateSettingSchema })
