/**
 * /api/me/emails — self-service personal-email management (Spec 06 PR D, §483-505).
 *
 * All routes require an authenticated portal session via authPlugin. Privacy-
 * preserving: collisions never reveal which identity owns the conflicting
 * email — the user only learns "this email cannot be used".
 */

import { Elysia, t } from 'elysia'
import { logger } from '~/logger'
import { authPlugin } from '../middleware/auth'
import {
  addPersonalEmail,
  verifyOwnedEmail,
  resendOwnedEmailOtp,
  setEmailPrimary,
  removeOwnedEmail,
} from '../services/me-emails'
import { emitUserUpdated } from '../services/provisioning-events'

const COLLISION_MESSAGE =
  'This email cannot be added. If you believe this is an error, contact your administrator.'

function extractRequestIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? 'unknown'
  )
}

export const meEmailRoutes = new Elysia({ prefix: '/me/emails' })
  .use(authPlugin)
  .post(
    '/',
    async ({ body, request, set, authUser }) => {
      const result = await addPersonalEmail({
        identityUserId: authUser.id,
        email: body.email,
        requestIp: extractRequestIp(request),
      })
      if (result.outcome === 'email_in_use') {
        set.status = 409
        return { error: 'EMAIL_IN_USE' as const, message: COLLISION_MESSAGE }
      }
      set.status = 202
      return {
        emailId: result.emailId,
        message: 'A verification code was sent. Enter it to confirm this email.',
      }
    },
    {
      body: t.Object({ email: t.String({ format: 'email', maxLength: 255 }) }),
      response: {
        202: t.Object({ emailId: t.String(), message: t.String() }),
        409: t.Object({ error: t.Literal('EMAIL_IN_USE'), message: t.String() }),
      },
    },
  )
  .post(
    '/:emailId/verify',
    async ({ params, body, set, authUser }) => {
      const result = await verifyOwnedEmail({
        identityUserId: authUser.id,
        emailId: params.emailId,
        code: body.code,
      })
      switch (result.outcome) {
        case 'verified':
          emitUserUpdated(authUser.id, ['emails']).catch((err) => {
            logger.error({ err, userId: authUser.id }, '[me-emails] emitUserUpdated failed')
          })
          return { ok: true as const }
        case 'not_owner':
        case 'email_not_found':
          set.status = 404
          return { error: 'EMAIL_NOT_FOUND' as const }
        case 'invalid_or_expired':
          set.status = 400
          return result.attemptsRemaining !== undefined
            ? { error: 'INVALID_OR_EXPIRED' as const, attemptsRemaining: result.attemptsRemaining }
            : { error: 'INVALID_OR_EXPIRED' as const }
      }
    },
    {
      params: t.Object({ emailId: t.String() }),
      body: t.Object({
        code: t.String({ minLength: 6, maxLength: 6, pattern: '^\\d{6}$' }),
      }),
      response: {
        200: t.Object({ ok: t.Literal(true) }),
        400: t.Union([
          t.Object({ error: t.Literal('INVALID_OR_EXPIRED') }),
          t.Object({ error: t.Literal('INVALID_OR_EXPIRED'), attemptsRemaining: t.Number() }),
        ]),
        404: t.Object({ error: t.Literal('EMAIL_NOT_FOUND') }),
      },
    },
  )
  .post(
    '/:emailId/resend',
    async ({ params, request, set, authUser }) => {
      const result = await resendOwnedEmailOtp({
        identityUserId: authUser.id,
        emailId: params.emailId,
        requestIp: extractRequestIp(request),
      })
      switch (result.outcome) {
        case 'sent':
          return { ok: true as const, message: 'A new verification code was sent.' }
        case 'already_verified':
          return { ok: true as const, message: 'This email is already verified.' }
        case 'rate_limited_email':
          set.status = 429
          set.headers['retry-after'] = '60'
          return {
            error: 'RATE_LIMITED' as const,
            message: 'Please wait a moment before requesting another code.',
          }
        case 'rate_limited_ip':
          set.status = 429
          return {
            error: 'RATE_LIMITED' as const,
            message: 'Too many requests. Please try again later.',
          }
        case 'not_owner':
        case 'email_not_found':
          set.status = 404
          return { error: 'EMAIL_NOT_FOUND' as const }
      }
    },
    {
      params: t.Object({ emailId: t.String() }),
      response: {
        200: t.Object({ ok: t.Literal(true), message: t.String() }),
        404: t.Object({ error: t.Literal('EMAIL_NOT_FOUND') }),
        429: t.Object({ error: t.Literal('RATE_LIMITED'), message: t.String() }),
      },
    },
  )
  .patch(
    '/:emailId',
    async ({ params, body, set, authUser }) => {
      if (body.isPrimary !== true) {
        set.status = 400
        return {
          error: 'INVALID_BODY' as const,
          message: 'Only { isPrimary: true } is supported on this endpoint.',
        }
      }
      const result = await setEmailPrimary({
        identityUserId: authUser.id,
        emailId: params.emailId,
      })
      switch (result.outcome) {
        case 'set':
          emitUserUpdated(authUser.id, ['emails']).catch((err) => {
            logger.error({ err, userId: authUser.id }, '[me-emails] emitUserUpdated failed')
          })
          return { ok: true as const }
        case 'not_owner':
        case 'email_not_found':
          set.status = 404
          return { error: 'EMAIL_NOT_FOUND' as const }
        case 'not_verified':
          set.status = 400
          return {
            error: 'NOT_VERIFIED' as const,
            message: 'Verify this email before setting it as primary.',
          }
      }
    },
    {
      params: t.Object({ emailId: t.String() }),
      body: t.Object({ isPrimary: t.Boolean() }),
      response: {
        200: t.Object({ ok: t.Literal(true) }),
        400: t.Union([
          t.Object({ error: t.Literal('INVALID_BODY'), message: t.String() }),
          t.Object({ error: t.Literal('NOT_VERIFIED'), message: t.String() }),
        ]),
        404: t.Object({ error: t.Literal('EMAIL_NOT_FOUND') }),
      },
    },
  )
  .delete(
    '/:emailId',
    async ({ params, set, authUser }) => {
      const result = await removeOwnedEmail({
        identityUserId: authUser.id,
        emailId: params.emailId,
      })
      switch (result.outcome) {
        case 'removed':
          emitUserUpdated(authUser.id, ['emails']).catch((err) => {
            logger.error({ err, userId: authUser.id }, '[me-emails] emitUserUpdated failed')
          })
          return { ok: true as const }
        case 'not_owner':
        case 'email_not_found':
          set.status = 404
          return { error: 'EMAIL_NOT_FOUND' as const }
        case 'last_verified_email':
          set.status = 409
          return {
            error: 'LAST_VERIFIED_EMAIL' as const,
            message: 'You cannot remove your only verified sign-in email.',
          }
        case 'workspace_kind_forbidden':
          set.status = 403
          return {
            error: 'WORKSPACE_KIND_FORBIDDEN' as const,
            message: 'Workspace emails are managed by an administrator.',
          }
      }
    },
    {
      params: t.Object({ emailId: t.String() }),
      response: {
        200: t.Object({ ok: t.Literal(true) }),
        403: t.Object({ error: t.Literal('WORKSPACE_KIND_FORBIDDEN'), message: t.String() }),
        404: t.Object({ error: t.Literal('EMAIL_NOT_FOUND') }),
        409: t.Object({ error: t.Literal('LAST_VERIFIED_EMAIL'), message: t.String() }),
      },
    },
  )
