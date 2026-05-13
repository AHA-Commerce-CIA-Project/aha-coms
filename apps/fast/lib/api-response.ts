import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ==========================================
// Standard API Response Types
// ==========================================

export interface ApiSuccessResponse<T = any> {
    status: 'success';
    data: T;
}

export interface ApiErrorResponse {
    status: 'error';
    message: string;
}

export type ApiResponse<T = any> = ApiSuccessResponse<T> | ApiErrorResponse;

// ==========================================
// Response Helpers
// ==========================================

/**
 * Return a standardized success response.
 */
export function successResponse<T>(data: T, statusCode = 200) {
    return NextResponse.json(
        { status: 'success', data } satisfies ApiSuccessResponse<T>,
        { status: statusCode }
    );
}

/**
 * Return a standardized error response.
 */
export function errorResponse(message: string, statusCode = 500) {
    return NextResponse.json(
        { status: 'error', message } satisfies ApiErrorResponse,
        { status: statusCode }
    );
}

// ==========================================
// Route Handler Wrapper (auto try/catch)
// ==========================================

type RouteHandler = (
    request: NextRequest,
    context?: any
) => Promise<NextResponse>;

/**
 * Wraps an API route handler with automatic error handling.
 * Catches unhandled errors and returns a standardized 500 response.
 *
 * Usage:
 *   export const GET = withErrorHandler(async (request) => {
 *       const data = await fetchSomething();
 *       return successResponse(data);
 *   });
 */
export function withErrorHandler(handler: RouteHandler): RouteHandler {
    return async (request: NextRequest, context?: any) => {
        try {
            return await handler(request, context);
        } catch (error: any) {
            console.error(`[API Error] ${request.method} ${request.nextUrl.pathname}:`, error);
            const message =
                process.env.NODE_ENV === 'development'
                    ? error.message || 'Internal server error'
                    : 'Internal server error';
            return errorResponse(message, 500);
        }
    };
}
