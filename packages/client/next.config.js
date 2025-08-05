/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
});

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  experimental: {
    appDir: true,
  },
  env: {
    SERVER_URL: process.env.SERVER_URL || 'http://localhost:3001',
  },
  images: {
    domains: ['localhost'],
  },
};

module.exports = withPWA(nextConfig);
