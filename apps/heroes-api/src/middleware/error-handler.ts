import type { ErrorHandler } from 'elysia'
import { AuthError } from './auth'

type ValidationErrorLike = {
  readonly name: string
  readonly issues?: unknown
}

export const errorHandler: ErrorHandler = ({ error, set }) => {
  // Only log unexpected errors — AuthError and validation are expected control flow
  if (!(error instanceof AuthError) && !('name' in error && error.name === 'ValidationError')) {
    console.error(`[API Error]`, error)
  }

  if (error instanceof AuthError) {
    set.status = error.status
    return {
      success: false,
      data: null,
      error: { code: error.code, message: error.message },
    }
  }

  if ('name' in error && (error.name === 'ValidationError' || error.name === 'ZodError')) {
    const validationError = error as ValidationErrorLike
    set.status = 400
    return {
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: validationError.issues,
      },
    }
  }

  set.status = 500
  return {
    success: false,
    data: null,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  }
}
