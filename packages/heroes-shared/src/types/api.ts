export type ApiResponse<T = unknown> = {
  readonly success: true
  readonly data: T
  readonly error: null
  readonly meta?: PaginationMeta
}

export type ApiError = {
  readonly success: false
  readonly data: null
  readonly error: {
    readonly code: string
    readonly message: string
    readonly details?: unknown
  }
  readonly meta?: undefined
}

export type PaginationMeta = {
  readonly total: number
  readonly page: number
  readonly limit: number
}

export type ApiResult<T = unknown> = ApiResponse<T> | ApiError
