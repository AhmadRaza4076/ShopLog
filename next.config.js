/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['@anthropic-ai/sdk', 'pdf-parse', 'mammoth'],
  },
  webpack: (config, { dev }) => {
    if (dev) {
      // Reduces stale chunk references during HMR on Windows (see Cannot find module './276.js')
      config.cache = false;
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
        ignored: ['**/node_modules/**', '**/.git/**'],
      };
    }
    return config;
  },
};

module.exports = nextConfig;
