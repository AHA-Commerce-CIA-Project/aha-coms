import { NextRequest, NextResponse } from 'next/server';

// Paths that render (or reply) without a portal __session cookie present.
//
// The middleware doesn't *verify* the cookie — full auth derivation runs in the
// page or Route Handler via loadFastAuthUser. The role here is the cheap edge
// block: requests without __session never reach an authed surface, they bounce
// to portal sign-in instead.
//
// Path matching runs against req.nextUrl.pathname, which Next.js strips of the
// `basePath: '/fast'` prefix — so the entries below stay basePath-agnostic.
const PUBLIC_PATH_PREFIXES = [
    '/request',
    '/track',
    '/api/employees',
    '/api/auth/google/callback',
    '/api/webhooks',
    '/api/cron',
    '/api/health',
    '/api/heartbeat',
];

const PORTAL_SIGNIN_ORIGIN = 'https://aha-coms.web.app';

function isPublic(pathname: string): boolean {
    return PUBLIC_PATH_PREFIXES.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
}

export function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl;

    if (isPublic(pathname)) {
        return NextResponse.next();
    }

    const hasSession = req.cookies.has('__session');
    if (hasSession) {
        return NextResponse.next();
    }

    // API callers (XHR/fetch from the client bundle, or server-to-server) get
    // a 401 rather than a redirect — chasing a 302 to portal sign-in would
    // hand them back HTML the JSON parser can't make sense of. Pages get the
    // portal-mediated redirect so the user lands on a real sign-in surface.
    if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const originalPath = `/fast${pathname}`;
    const redirectTo = encodeURIComponent(originalPath);
    const signInUrl = `${PORTAL_SIGNIN_ORIGIN}/portal?app=fast&redirect_to=${redirectTo}`;
    return NextResponse.redirect(signInUrl);
}

export const config = {
    // Skip framework-internal paths + the manifest + favicon. Everything else
    // goes through the public allowlist + cookie check above.
    matcher: ['/((?!_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|.*\\.png|.*\\.svg).*)'],
};
