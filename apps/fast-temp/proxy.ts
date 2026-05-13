import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function proxy(req: NextRequest) {
  const sessionCookie = req.cookies.get('better-auth.session_token') || req.cookies.get('__Secure-better-auth.session_token');

  const isAuthRoute = req.nextUrl.pathname.startsWith('/login') || req.nextUrl.pathname.startsWith('/register');
  const isStaticAsset = /\.(png|jpg|jpeg|gif|svg|ico|webp|css|js|woff|woff2|ttf|eot)$/i.test(req.nextUrl.pathname);
  const isPublicRoute =
    isStaticAsset ||
    req.nextUrl.pathname.startsWith('/request') ||
    req.nextUrl.pathname.startsWith('/track') ||
    req.nextUrl.pathname.startsWith('/activate') ||
    req.nextUrl.pathname.startsWith('/complete') ||
    req.nextUrl.pathname.startsWith('/forgot-password') ||
    req.nextUrl.pathname.startsWith('/reset-password') ||
    req.nextUrl.pathname.startsWith('/api/') ||
    req.nextUrl.pathname.startsWith('/_next') ||
    req.nextUrl.pathname === '/favicon.ico' ||
    req.nextUrl.pathname === '/manifest.webmanifest' ||
    req.nextUrl.pathname === '/sw.js';

  // If no session cookie and not on an auth/public route, redirect to login
  if (!sessionCookie && !isAuthRoute && !isPublicRoute) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = '/login';
    return NextResponse.redirect(redirectUrl);
  }

  // If session exists and trying to access auth routes, redirect to home
  if (sessionCookie && isAuthRoute) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = '/';
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}
