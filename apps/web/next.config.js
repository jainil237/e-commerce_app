/** @type {import('next').NextConfig} */
const apiBaseUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000')
  .replace(/\/+$/, '')
  .replace(/\/api\/v1$/, '')

const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      // Cloudinary CDN
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
      // Cloudflare R2 / any other HTTPS CDN
      {
        protocol: 'https',
        hostname: '**',
      },
      // Local dev server
      {
        protocol: 'http',
        hostname: 'localhost',
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiBaseUrl}/api/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
