"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("./config/env");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const morgan_1 = __importDefault(require("morgan"));
const path_1 = __importDefault(require("path"));
const prisma_1 = require("./utils/prisma");
// Import routes
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const product_routes_1 = __importDefault(require("./routes/product.routes"));
const category_routes_1 = __importDefault(require("./routes/category.routes"));
const cart_routes_1 = __importDefault(require("./routes/cart.routes"));
const order_routes_1 = __importDefault(require("./routes/order.routes"));
const address_routes_1 = __importDefault(require("./routes/address.routes"));
const coupon_routes_1 = __importDefault(require("./routes/coupon.routes"));
const webhook_routes_1 = __importDefault(require("./routes/webhook.routes"));
const admin_routes_1 = __importDefault(require("./routes/admin.routes"));
const wishlist_routes_1 = __importDefault(require("./routes/wishlist.routes"));
// Import storage provider detection
const storage_service_1 = require("./services/storage.service");
// Import middleware
const error_middleware_1 = require("./middleware/error.middleware");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 4000;
const uploadsRoot = path_1.default.resolve(process.cwd(), 'uploads');
app.disable('x-powered-by');
const parseCookies = (cookieHeader) => {
    const parsed = {};
    if (!cookieHeader) {
        return parsed;
    }
    for (const part of cookieHeader.split(';')) {
        const [rawKey, ...rawValueParts] = part.trim().split('=');
        if (!rawKey) {
            continue;
        }
        const rawValue = rawValueParts.join('=');
        parsed[rawKey] = decodeURIComponent(rawValue || '');
    }
    return parsed;
};
// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);
// Parse cookies without external middleware so JWT cookies are available in all routes.
app.use((req, _res, next) => {
    if (!req.cookies) {
        req.cookies = parseCookies(req.headers.cookie);
    }
    next();
});
// Security middleware
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
}));
// CORS configuration
app.use((0, cors_1.default)({
    origin: [
        process.env.FRONTEND_URL || 'http://localhost:3000',
        process.env.ADMIN_URL || 'http://localhost:3001',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
}));
// Protect API responses from browser/proxy caching in production-like flows.
app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});
// Rate limiting for auth routes
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 requests per window
    message: { success: false, message: 'Too many requests, please try again later', code: 'RATE_LIMITED' },
    standardHeaders: true,
    legacyHeaders: false,
});
// General rate limiting
const generalLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
    standardHeaders: true,
    legacyHeaders: false,
});
// Logging
app.use((0, morgan_1.default)('combined'));
// Body parsing
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
// Static files for uploads
app.use('/uploads', express_1.default.static(uploadsRoot));
// Health check
app.get('/health', (req, res) => {
    res.json({ success: true, message: 'Server is healthy', timestamp: new Date().toISOString() });
});
// API routes
app.use('/api/v1/auth', authLimiter, auth_routes_1.default);
app.use('/api/v1/products', generalLimiter, product_routes_1.default);
app.use('/api/v1/categories', generalLimiter, category_routes_1.default);
app.use('/api/v1/cart', generalLimiter, cart_routes_1.default);
app.use('/api/v1/orders', generalLimiter, order_routes_1.default);
app.use('/api/v1/addresses', generalLimiter, address_routes_1.default);
app.use('/api/v1/coupons', generalLimiter, coupon_routes_1.default);
app.use('/api/v1/webhooks', webhook_routes_1.default);
app.use('/api/v1/admin', generalLimiter, admin_routes_1.default);
app.use('/api/v1/wishlist', generalLimiter, wishlist_routes_1.default);
// Error handling
app.use(error_middleware_1.notFound);
app.use(error_middleware_1.errorHandler);
const startServer = async () => {
    try {
        await prisma_1.prisma.$connect();
        console.log('✅ Database connected');
        app.listen(PORT, () => {
            const provider = (0, storage_service_1.getActiveProvider)();
            const providerLabels = { r2: '☁️  Cloudflare R2', cloudinary: '🌤️  Cloudinary', local: '💾 Local disk' };
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`📡 API available at http://localhost:${PORT}/api/v1`);
            console.log(`🏥 Health check at http://localhost:${PORT}/health`);
            console.log(`📦 Storage provider: ${providerLabels[provider]}`);
        });
    }
    catch (error) {
        console.error('❌ Failed to connect to database:', error);
        process.exit(1);
    }
};
void startServer();
exports.default = app;
//# sourceMappingURL=index.js.map