/** @type {import('next').NextConfig} */
const apiBaseUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000')
  .replace(/\/+$/, '')
  .replace(/\/api\/v1$/, '')

// Allowlist of hosts /_next/image may fetch from. A wildcard here turns the
// optimizer into an open proxy, so the R2 host is derived from the same env var
// the server uploads with rather than being restated.
const remotePatterns = [
  { protocol: 'https', hostname: 'res.cloudinary.com' },
  { protocol: 'http', hostname: 'localhost' },
]

if (process.env.R2_PUBLIC_URL) {
  remotePatterns.push({
    protocol: 'https',
    hostname: new URL(process.env.R2_PUBLIC_URL).hostname,
  })
}

const nextConfig = {
  reactStrictMode: true,
  images: { remotePatterns },
  eslint: {
    // Same policy as apps/web: lint stays real via `next lint` / CI, but
    // does not gate the build. See apps/web/next.config.js for why.
    ignoreDuringBuilds: true,
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
