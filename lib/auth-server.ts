import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

/**
 * Get the current authenticated session in a Server Component or API Route.
 * Returns { session, user } or null if not authenticated.
 */
export async function getServerSession() {
    const session = await auth.api.getSession({
        headers: await headers(),
    });
    return session;
}

/**
 * Require authentication - throws/returns 401 if not authenticated.
 * Use in API routes for convenience.
 */
export async function requireAuth() {
    const session = await getServerSession();
    if (!session) {
        return null;
    }
    return session;
}
