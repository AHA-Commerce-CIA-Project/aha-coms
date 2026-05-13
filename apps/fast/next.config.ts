import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  basePath: '/fast',
  assetPrefix: '/fast',
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
        pathname: '/aha-fast-*/**',
      },
    ],
  },
  outputFileTracingIncludes: {
    '/api/profile/avatar': ['./node_modules/sharp/**/*'],
  },
  serverExternalPackages: ['sharp'],
};

export default nextConfig;
