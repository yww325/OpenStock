// The Finnhub key pool, read from the environment.
//
// It lives outside the 'use server' module on purpose. Every export of a 'use server' file has to
// be an async server action, and a promise is always truthy -- so a check written as
// `if (!isFinnhubConfigured())` would silently never fire. A plain function here cannot be
// misused that way, and it does not add a public server action endpoint either.
//
// Key pool: each free key has its own 60 req/min, so N keys = N x the quota. Rotated per request.
// Read through an alias: `next build` freezes a literal process.env.NEXT_PUBLIC_* into the bundle, so
// Docker and Railway images (built without secrets) would ignore a NEXT_PUBLIC_FINNHUB_API_KEY set
// at runtime.

const env = process.env;

export const finnhubKeys = (env.FINNHUB_API_KEYS || env.NEXT_PUBLIC_FINNHUB_API_KEY || env.FINNHUB_API_KEY || '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);

// Whether a key is available at all. Callers that would fan out one request per symbol ask this
// first, so a missing key costs one check instead of N failed requests.
export const isFinnhubConfigured = (): boolean => finnhubKeys.length > 0;
