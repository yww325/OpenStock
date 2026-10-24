import { betterAuth } from "better-auth";
import {mongodbAdapter} from "better-auth/adapters/mongodb";
import {connectToDatabase} from "@/database/mongoose";
import {nextCookies} from "better-auth/next-js";
import { headers } from "next/headers";
import { cache } from "react";
import { sendPasswordResetEmail } from "@/lib/nodemailer/reset-password";
import { BASE_PATH } from "@/lib/base-path";


type MongoDb = Parameters<typeof mongodbAdapter>[0];

// Better Auth serves its API under /api/auth. When the app is mounted on a
// sub-path the API moves with it, so the path is built from the mount path
// instead of the default.
const AUTH_BASE_PATH = `${BASE_PATH}/api/auth`;

// BETTER_AUTH_URL is the public URL of the app, which can carry a sub-path.
// Better Auth derives its own base path from the path of the base URL and does
// not append one to a URL that already has a path, so the origin is passed
// alone and the sub-path travels in AUTH_BASE_PATH.
const AUTH_BASE_URL = (() => {
    const configured = process.env.BETTER_AUTH_URL?.trim();
    if (!configured) return undefined;
    try {
        return new URL(configured).origin;
    } catch {
        return configured;
    }
})();

// Typed from the real config, so additional user fields (country, ...) show up in session types
const createAuth = (database: MongoDb) => betterAuth({
        database: mongodbAdapter(database),
       secret: process.env.BETTER_AUTH_SECRET,
        baseURL: AUTH_BASE_URL,
        basePath: AUTH_BASE_PATH,
        // Onboarding answers live on the user so the profile page can show and edit them
        user: {
            additionalFields: {
                country: { type: "string", required: false },
                investmentGoals: { type: "string", required: false },
                riskTolerance: { type: "string", required: false },
                preferredIndustry: { type: "string", required: false },
            },
        },
        emailAndPassword: {
            enabled: true,
            disableSignUp: false,
            requireEmailVerification: false,
            minPasswordLength: 8,
            maxPasswordLength: 128,
            autoSignIn: true,
            // A reset is how a victim takes an account back: sign out every other session (off by default)
            revokeSessionsOnPasswordReset: true,
            sendResetPassword: async ({ user, url }) => {
                void sendPasswordResetEmail({
                    email: user.email,
                    name: user.name,
                    resetUrl: url,
                }).catch((error) => {
                    console.error('Failed to queue password reset email:', error);
                });
            },
        },
        // Signed session cookie for 5 min: pages stop paying a MongoDB round trip per request.
        // Trade-off: a revoked session can stay valid for up to 5 minutes.
        session: {
            cookieCache: { enabled: true, maxAge: 5 * 60 },
        },
        // No account linking. Sign-up doesn't verify emails, so linking a Google/GitHub identity to an
        // existing account with the same email would let someone pre-register a victim's address and
        // later capture their social sign-in. This switch also blocks explicit linking (still true in 1.7);
        // when social sign-in ships, `disableImplicitLinking: true` keeps explicit linking and drops only the email match.
        account: {
            accountLinking: { enabled: false },
        },
        // Providers stay disabled until their env vars are set
        socialProviders: {
            google: {
                enabled: !!process.env.GOOGLE_CLIENT_ID,
                clientId: process.env.GOOGLE_CLIENT_ID as string,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
            },
            github: {
                enabled: !!process.env.GITHUB_CLIENT_ID,
                clientId: process.env.GITHUB_CLIENT_ID as string,
                clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
            },
        },
        plugins: [nextCookies()],
});

let authInstance: ReturnType<typeof createAuth> | null = null;

export const getAuth = async () => {
    if (authInstance) return authInstance;

    // Without a secret better-auth falls back to a public default anyone could forge sessions with (1.7 refuses it in
    // production too); fail here first, before connecting. Checked on first use, not at import, so `next build` needs no secrets.
    if (process.env.NODE_ENV === 'production' && !process.env.BETTER_AUTH_SECRET && !process.env.AUTH_SECRET) {
        throw new Error('BETTER_AUTH_SECRET must be set in production');
    }

    const mongoose = await connectToDatabase();
    const database = mongoose.connection.db;
    if (!database) {
        throw new Error("MongoDB connection not found!");
    }

    authInstance = createAuth(database);
    return authInstance;
}

type Auth = ReturnType<typeof createAuth>;

// Connects on first use, not at import: `next build` imports this module while collecting page data, and a
// top-level `await getAuth()` made every build (Docker, Railway, CI) need a reachable MongoDB.
export const auth = {
    api: new Proxy({} as Auth['api'], {
        get: (_, method) => async (...args: unknown[]) => {
            const { api } = await getAuth();
            return (api[method as keyof Auth['api']] as (...a: unknown[]) => unknown)(...args);
        },
    }),
    handler: async (request: Request) => (await getAuth()).handler(request),
};

// One session lookup per request, shared by layouts, pages and actions
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

// Server actions are public endpoints: never trust a userId sent from the client.
export const requireUserId = async () => {
    const session = await getSession();
    if (!session?.user) throw new Error("Unauthorized");
    return session.user.id;
}
