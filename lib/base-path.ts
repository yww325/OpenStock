// The app can be mounted under a sub-path, e.g. https://example.com/OpenStock.
// Next.js bakes the path into the build, so NEXT_PUBLIC_BASE_PATH has to be set
// when the app is built, not only when it runs.
const configured = process.env.NEXT_PUBLIC_BASE_PATH?.trim() ?? '';

export const BASE_PATH = (() => {
    if (!configured || configured === '/') return '';
    const withSlash = configured.startsWith('/') ? configured : `/${configured}`;
    return withSlash.replace(/\/+$/, '');
})();

// Prefixes an app path with the mount path. `next/link` and the app router do
// this on their own; plain fetch() calls and redirects do not.
export const withBasePath = (path: string) => `${BASE_PATH}${path}`;

// Points a file in /public at the right place. Absolute URLs, such as a
// sponsor's own logo on their server, are left alone.
export const assetUrl = (path: string) =>
    path.startsWith('/') ? `${BASE_PATH}${path}` : path;
