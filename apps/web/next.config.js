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
    // No .eslintrc existed before this chain added one for the W-08/W-12
    // gates, so `next build`'s built-in lint step was previously a no-op.
    // Enforcing it now would fail production builds on pre-existing,
    // unrelated errors (react/no-unescaped-entities, a stale
    // @typescript-eslint/no-explicit-any disable comment) — a regression
    // this change must not introduce. Lint stays real and visible via
    // `next lint` / CI; it just does not gate the build.
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
