import type { NextConfig } from "next";

// The app can be served from a sub-path, e.g. https://example.com/OpenStock.
// Next.js bakes this into the build, so it is read at build time.
const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() ?? '';
const basePath = configuredBasePath && configuredBasePath !== '/'
    ? (configuredBasePath.startsWith('/') ? configuredBasePath : `/${configuredBasePath}`).replace(/\/+$/, '')
    : '';

const nextConfig: NextConfig = {
    basePath,
    devIndicators: false,
    // The Futu SDK is plain JavaScript with no type definitions: let Node load it as it is
    // instead of bundling it.
    serverExternalPackages: ['futu-api'],
    // /whats-new was live briefly before the changelog replaced it
    async redirects() {
        return [{ source: '/whats-new', destination: '/changelog', permanent: true }];
    },
    turbopack: {
        root: process.cwd(),
    },
    // No remote images: every next/image src is a local file. Allowing a public upload host here (i.ibb.co was)
    // lets anyone feed files to the image optimizer on self-hosted servers.
    eslint: {
        ignoreDuringBuilds: true,
    },
    typescript: {
        ignoreBuildErrors: true,
    }
};

export default nextConfig;
