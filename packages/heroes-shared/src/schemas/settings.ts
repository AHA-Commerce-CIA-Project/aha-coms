import { Type as t, type Static } from '@sinclair/typebox'

export const listSettingsSchema = t.Object({})

export const updateSettingSchema = t.Object({
  key: t.String({ minLength: 1, maxLength: 100 }),
  value: t.Any(),
})

export type ListSettingsInput = Static<typeof listSettingsSchema>
export type UpdateSettingInput = Static<typeof updateSettingSchema>
