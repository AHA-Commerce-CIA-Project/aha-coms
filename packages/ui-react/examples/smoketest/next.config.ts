import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@coms-portal/ui-react',
    '@coms-portal/account-widget-react',
  ],
};

export default nextConfig;
