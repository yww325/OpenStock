import { NextRequest, NextResponse } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';
import { isPublicPath } from '@/lib/public-paths';
import { withBasePath } from '@/lib/base-path';

// Behind a proxy the request URL carries the address of the app itself, so the
// public host comes from the headers the proxy passes on.
const publicUrl = (request: NextRequest, path: string) => {
    const forwarded = (name: string) => request.headers.get(name)?.split(',')[0].trim();
    const host = forwarded('x-forwarded-host') ?? forwarded('host');
    const proto = forwarded('x-forwarded-proto') ?? new URL(request.url).protocol.replace(':', '');
    return new URL(path, host ? `${proto}://${host}` : request.url);
};

export async function middleware(request: NextRequest) {
    // Marketing, public ticker and comparison pages, robots.txt and sitemap.xml.
    // The signed-in app (/stocks, /dashboard, /watchlist, /profile) still requires a session cookie.
    if (isPublicPath(request.nextUrl.pathname)) return NextResponse.next();

    const sessionCookie = getSessionCookie(request);

    // Check cookie presence - prevents obviously unauthorized users
    if (!sessionCookie) {
        // The mount path is not part of nextUrl.pathname, so it has to be added back
        return NextResponse.redirect(publicUrl(request, withBasePath('/sign-in')));
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        // robots.txt and sitemap.xml are excluded so a crawler is never sent to sign-in,
        // even if the public-path list above is edited later.
        '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|sign-in|sign-up|forgot-password|reset-password|assets).*)',
    ],
};
