import { auth } from "@/lib/better-auth/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { BASE_PATH } from "@/lib/base-path";

// Next.js serves the app under its base path and removes it from the request
// before the route handler sees it. Better Auth matches its routes against the
// URL it is given and builds its callback URLs (OAuth redirect, password reset
// link) from that same base path, so the mount path is put back here and the
// two always agree.
const restoreMountPath = (request: Request): Request => {
    if (!BASE_PATH) return request;

    const url = new URL(request.url);
    if (!url.pathname.startsWith(`${BASE_PATH}/`)) {
        url.pathname = `${BASE_PATH}${url.pathname}`;
    }
    return new Request(url, request);
};

const handler = toNextJsHandler(auth);

// Needed for OAuth callbacks (/api/auth/callback/google, /api/auth/callback/github)
export const GET = (request: Request) => handler.GET(restoreMountPath(request));
export const POST = (request: Request) => handler.POST(restoreMountPath(request));
