import { t } from 'elysia'

/** Reusable pagination query fields with string → number coercion for HTTP query params */
export const paginationQuery = {
  page: t.Numeric({ minimum: 1, default: 1 }),
  limit: t.Numeric({ minimum: 1, maximum: 100, default: 20 }),
}

/** Pagination with higher default limit (for audit logs) */
export const paginationQuery50 = {
  page: t.Numeric({ minimum: 1, default: 1 }),
  limit: t.Numeric({ minimum: 1, maximum: 100, default: 50 }),
}
