import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
  async rewrites() {
    return [
      {
        source: '/api/v1/photos/:photoId',
        destination: `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/v1/photos/:photoId`,
      },
    ];
  },
};

export default nextConfig;
