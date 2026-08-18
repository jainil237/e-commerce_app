import './config/env'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import morgan from 'morgan'
import path from 'path'
import { prisma } from './utils/prisma'

// Import routes
import authRoutes from './routes/auth.routes'
import productRoutes from './routes/product.routes'
import categoryRoutes from './routes/category.routes'
import cartRoutes from './routes/cart.routes'
import orderRoutes from './routes/order.routes'
import addressRoutes from './routes/address.routes'
import couponRoutes from './routes/coupon.routes'
import webhookRoutes from './routes/webhook.routes'
import adminRoutes from './routes/admin.routes'
import wishlistRoutes from './routes/wishlist.routes'
import rmaRoutes from './routes/rma.routes'


// Import storage provider detection
import { getActiveProvider } from './services/storage.service'

// Import middleware
import { errorHandler, notFound } from './middleware/error.middleware'

const app = express()
const PORT = process.env.PORT || 4000

app.disable('x-powered-by')

const parseCookies = (cookieHeader?: string) => {
  const parsed: Record<string, string> = {}
  if (!cookieHeader) {
    return parsed
  }

  for (const part of cookieHeader.split(';')) {
    const [rawKey, ...rawValueParts] = part.trim().split('=')
    if (!rawKey) {
      continue
    }
    const rawValue = rawValueParts.join('=')
    parsed[rawKey] = decodeURIComponent(rawValue || '')
  }

  return parsed
}

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1)

// Parse cookies without external middleware so JWT cookies are available in all routes.
app.use((req, _res, next) => {
  if (!(req as { cookies?: Record<string, string> }).cookies) {
    (req as { cookies?: Record<string, string> }).cookies = parseCookies(req.headers.cookie)
  }
  next()
})

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}))

// CORS configuration
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    process.env.ADMIN_URL || 'http://localhost:3001',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
}))

// Protect API responses from browser/proxy caching in production-like flows.
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
  next()
})

// General rate limiting with environment-based limits
const isDevelopment = process.env.NODE_ENV === 'development'
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 1000 : 100, // 1000 requests in dev, 100 in prod
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later', code: 'RATE_LIMITED' },
})

// Logging
app.use(morgan('combined'))

// R3: the Razorpay webhook must verify its HMAC against the exact bytes
// Razorpay signed, not a re-serialization of whatever express.json() parsed
// (SEC-3 — re-serialization does not reliably reproduce the original byte
// sequence). Scoped to this one path and registered before the global JSON
// parser below, so express.json() sees this request already has a body
// (Express's body-parsers no-op when a prior parser already consumed the
// stream) and every other route's parsing is unaffected.
app.use('/api/v1/webhooks/razorpay', express.raw({ type: 'application/json' }))

// Body parsing
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Dev-only local upload serving. Production never writes here — the storage
// service's local fallback (storage.service.ts) refuses to run when
// NODE_ENV=production, and the startup guard below refuses to boot without a
// cloud provider — so this route only exists to serve files the dev-mode
// fallback wrote.
if (process.env.NODE_ENV !== 'production') {
  app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')))
}

// Health check
app.get('/health', (req, res) => {
  res.json({ success: true, message: 'Server is healthy', timestamp: new Date().toISOString() })
})

// API routes
app.use('/api/v1/auth', generalLimiter, authRoutes)
app.use('/api/v1/products', generalLimiter, productRoutes)
app.use('/api/v1/categories', generalLimiter, categoryRoutes)
app.use('/api/v1/cart', generalLimiter, cartRoutes)
app.use('/api/v1/orders', generalLimiter, orderRoutes)
app.use('/api/v1/addresses', generalLimiter, addressRoutes)
app.use('/api/v1/coupons', generalLimiter, couponRoutes)
app.use('/api/v1/webhooks', webhookRoutes)
app.use('/api/v1/admin', generalLimiter, adminRoutes)
app.use('/api/v1/wishlist', generalLimiter, wishlistRoutes)
app.use('/api/v1/rma', generalLimiter, rmaRoutes)

// Error handling
app.use(notFound)
app.use(errorHandler)

const startServer = async () => {
  try {
    await prisma.$connect()
    console.log('✅ Database connected')

    // RI1: Fail fast in production if no cloud storage is configured
    const isProduction = process.env.NODE_ENV === 'production'
    const provider = getActiveProvider()
    if (isProduction && provider === 'local') {
      const error = new Error(
        'Cannot start production server without cloud storage provider configured. ' +
        'Set R2_* (Cloudflare) or CLOUDINARY_* environment variables.'
      )
      console.error('❌ Startup validation failed:', error.message)
      process.exit(1)
    }

    app.listen(PORT, () => {
      const provider = getActiveProvider()
      const providerLabels = { r2: '☁️  Cloudflare R2', cloudinary: '🌤️  Cloudinary', local: '💾 Local disk' }
      console.log(`🚀 Server running on port ${PORT}`)
      console.log(`📡 API available at http://localhost:${PORT}/api/v1`)
      console.log(`🏥 Health check at http://localhost:${PORT}/health`)
      console.log(`📦 Storage provider: ${providerLabels[provider]}`)
    })
  } catch (error) {
    console.error('❌ Failed to connect to database:', error)
    process.exit(1)
  }
}

// Importing this module under test (supertest) must not bind a port or block
// on a DB connection at import time — only start listening outside tests.
if (process.env.NODE_ENV !== 'test') {
  void startServer()
}

export default app
