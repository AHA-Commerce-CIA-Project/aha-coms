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
    // Public Request Form endpoints — /request renders for guests and walks
    // through dropdowns (brand codes, employees, assignee/meeting-invite
    // users) then POSTs the submission (request, request-meeting, upload).
    // Each handler is designed for guest traffic: input is Zod-validated
    // (request, request-meeting), uploads cap at 25MB (upload), users/public
    // returns id + name + team only (email scrubbed in the same PR as this
    // allowlist), brand codes + employees are reference data with no
    // user-scoped fields. Spam/abuse vectors (notify-all on submit, no MIME
    // check on upload, no rate limit) are by-design or follow-ups — see
    // PR #16 description.
    '/api/brand-codes',
    '/api/employees',
    '/api/users/public',
    '/api/request',
    '/api/request-meeting',
    '/api/upload',
    '/api/auth/google/callback',
    '/api/webhooks',
    '/api/cron',
    '/api/health',
    '/api/heartbeat',
];

// Path patterns that need a regex match instead of a fixed prefix —
// specifically the public task tracker's per-task comments endpoint, where
// the task id is dynamic. PR #16 allowlisted /track (the page) and
// /api/request (the initial task lookup) but missed the comments
// list/post endpoint that the page calls after the task resolves, so
// guests hit the email link, see the task, and find an empty comments
// section + "Failed to send comment" on reply. The route handler in
// apps/fast/app/api/tasks/[id]/comments/route.ts already enforces token
// vs session auth before reading anything; the middleware just needs to
// let the request reach the handler. The regex anchors `comments` at the
// end of the path so the sub-endpoints — /comments/<commentId> (PATCH /
// DELETE) and /comments/<commentId>/reactions (POST) — stay session-only.
const PUBLIC_PATH_PATTERNS: RegExp[] = [
    /^\/api\/tasks\/[^/]+\/comments$/,
];

const PORTAL_SIGNIN_ORIGIN = 'https://aha-coms.web.app';

function isPublic(pathname: string): boolean {
    if (
        PUBLIC_PATH_PREFIXES.some(
            (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
        )
    ) {
        return true;
    }
    return PUBLIC_PATH_PATTERNS.some((pat) => pat.test(pathname));
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
    // Skip framework-internal paths + the manifest + favicon + the service
    // worker. Everything else goes through the public allowlist + cookie
    // check above.
    //
    // `sw.js` needs the carve-out because the browser fetches the worker
    // script BEFORE any user signs in — a redirect to portal sign-in for
    // `/fast/sw.js` means the worker never registers and the PWA fails
    // installability. The other static assets (manifest.webmanifest, .png
    // icons, .svg art) already have their own exclusions for the same
    // reason; sw.js was simply missed at T68.
    matcher: ['/((?!_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|sw\\.js|.*\\.png|.*\\.svg).*)'],
};
