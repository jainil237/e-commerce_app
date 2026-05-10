"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = require("../utils/prisma");
const auth_middleware_1 = require("../middleware/auth.middleware");
const error_middleware_1 = require("../middleware/error.middleware");
const zod_1 = require("zod");
const node_cache_1 = __importDefault(require("node-cache"));
const email_service_1 = require("../services/email.service");
const config_1 = require("../utils/config");
const router = (0, express_1.Router)();
const otpCache = new node_cache_1.default({ stdTTL: 600 }); // 10 minutes OTP expiration
const registerSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Name must be at least 2 characters'),
    email: zod_1.z.string().email('Invalid email address'),
    phone: zod_1.z.string().regex(/^[6-9]\d{9}$/, 'Invalid Indian phone number'),
    password: zod_1.z.string().min(8, 'Password must be at least 8 characters')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number')
        .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
});
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email address'),
    password: zod_1.z.string().min(1, 'Password is required'),
});
const forgotPasswordSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email address'),
});
const resetPasswordSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email address'),
    otp: zod_1.z.string().length(6, 'Invalid OTP'),
    newPassword: zod_1.z.string().min(8, 'Password must be at least 8 characters')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number')
        .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
});
const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};
const ACCESS_COOKIE_OPTIONS = {
    ...COOKIE_OPTIONS,
    maxAge: 15 * 60 * 1000, // 15 mins
};
// Generate tokens
const generateTokens = (user) => {
    const accessToken = jsonwebtoken_1.default.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jsonwebtoken_1.default.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
    return { accessToken, refreshToken };
};
// Register
router.post('/register', async (req, res, next) => {
    try {
        const validatedData = registerSchema.parse(req.body);
        // Check if user already exists
        const existingUser = await prisma_1.prisma.user.findFirst({
            where: {
                OR: [
                    { email: validatedData.email },
                    { phone: validatedData.phone },
                ],
            },
        });
        if (existingUser) {
            if (existingUser.email === validatedData.email) {
                throw (0, error_middleware_1.createError)(400, 'Email already registered', 'EMAIL_EXISTS');
            }
            throw (0, error_middleware_1.createError)(400, 'Phone number already registered', 'PHONE_EXISTS');
        }
        // Hash password
        const passwordHash = await bcrypt_1.default.hash(validatedData.password, 12);
        // Create user
        const user = await prisma_1.prisma.user.create({
            data: {
                name: validatedData.name,
                email: validatedData.email,
                phone: validatedData.phone,
                passwordHash,
                role: 'CUSTOMER',
            },
        });
        // Generate tokens
        const { accessToken, refreshToken } = generateTokens(user);
        // Save refresh token
        await prisma_1.prisma.refreshToken.create({
            data: {
                userId: user.id,
                token: refreshToken,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
        });
        // Set cookies
        res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);
        res.cookie('accessToken', accessToken, ACCESS_COOKIE_OPTIONS);
        res.status(201).json({
            success: true,
            data: {
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    phone: user.phone,
                    role: user.role,
                },
                accessToken,
            },
        });
    }
    catch (error) {
        next(error);
    }
});
// Login
router.post('/login', async (req, res, next) => {
    try {
        const validatedData = loginSchema.parse(req.body);
        // Find user
        const user = await prisma_1.prisma.user.findUnique({
            where: { email: validatedData.email },
        });
        if (!user) {
            throw (0, error_middleware_1.createError)(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
        }
        // Verify password
        const isValidPassword = await bcrypt_1.default.compare(validatedData.password, user.passwordHash);
        if (!isValidPassword) {
            throw (0, error_middleware_1.createError)(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
        }
        // Generate tokens
        const { accessToken, refreshToken } = generateTokens(user);
        // Save refresh token
        await prisma_1.prisma.refreshToken.create({
            data: {
                userId: user.id,
                token: refreshToken,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
        });
        // Explicitly clear old legacy cookies that were incorrectly bound to /api/v1/auth
        res.clearCookie('refreshToken', { path: '/api/v1/auth' });
        res.clearCookie('accessToken', { path: '/api/v1/auth' });
        // Set new global cookies
        res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);
        res.cookie('accessToken', accessToken, ACCESS_COOKIE_OPTIONS);
        res.json({
            success: true,
            data: {
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    phone: user.phone,
                    role: user.role,
                },
                accessToken,
            },
        });
    }
    catch (error) {
        next(error);
    }
});
// Logout
router.post('/logout', async (req, res, next) => {
    try {
        const refreshToken = req.cookies?.refreshToken;
        if (refreshToken) {
            // Delete refresh token from database
            await prisma_1.prisma.refreshToken.deleteMany({
                where: { token: refreshToken },
            });
        }
        // Clear cookies for the correct global path
        res.clearCookie('refreshToken', COOKIE_OPTIONS);
        res.clearCookie('accessToken', ACCESS_COOKIE_OPTIONS);
        // Also clear the legacy cookies scoped to /api/v1/auth
        res.clearCookie('refreshToken', { path: '/api/v1/auth' });
        res.clearCookie('accessToken', { path: '/api/v1/auth' });
        res.json({
            success: true,
            message: 'Logged out successfully',
        });
    }
    catch (error) {
        next(error);
    }
});
// Forgot password — request OTP
router.post('/forgot-password', async (req, res, next) => {
    try {
        const validatedData = forgotPasswordSchema.parse(req.body);
        const config = (0, config_1.getStoreConfig)();
        const user = await prisma_1.prisma.user.findUnique({
            where: { email: validatedData.email },
        });
        if (!user) {
            // Return success even if user not found to prevent email enumeration
            res.json({
                success: true,
                message: 'If your email is registered, you will receive an OTP',
                emailServiceEnabled: config.features.emailService,
            });
            return;
        }
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        otpCache.set(`pwd_reset_${user.email}`, otp);
        if (config.features.emailService) {
            await (0, email_service_1.sendOtpEmail)(user.email, otp, 'password-reset');
        }
        else {
            // TODO: Remove console log once email service is purchased
            console.log(`[PASSWORD RESET] OTP for ${user.email}: ${otp}`);
        }
        res.json({
            success: true,
            message: config.features.emailService
                ? 'If your email is registered, you will receive an OTP'
                : 'Email service is not configured. Check server console for OTP.',
            emailServiceEnabled: config.features.emailService,
        });
    }
    catch (error) {
        next(error);
    }
});
// Reset password — verify OTP and update password
router.post('/reset-password', async (req, res, next) => {
    try {
        const validatedData = resetPasswordSchema.parse(req.body);
        const storedOtp = otpCache.get(`pwd_reset_${validatedData.email}`);
        if (!storedOtp || storedOtp !== validatedData.otp) {
            throw (0, error_middleware_1.createError)(400, 'Invalid or expired OTP', 'INVALID_OTP');
        }
        const user = await prisma_1.prisma.user.findUnique({
            where: { email: validatedData.email },
        });
        if (!user) {
            throw (0, error_middleware_1.createError)(404, 'User not found', 'USER_NOT_FOUND');
        }
        const passwordHash = await bcrypt_1.default.hash(validatedData.newPassword, 12);
        await prisma_1.prisma.user.update({
            where: { email: user.email },
            data: { passwordHash },
        });
        // Invalidate OTP and revoke all active sessions for security
        otpCache.del(`pwd_reset_${user.email}`);
        await prisma_1.prisma.refreshToken.deleteMany({ where: { userId: user.id } });
        res.json({ success: true, message: 'Password reset successfully' });
    }
    catch (error) {
        next(error);
    }
});
// Refresh token
router.post('/refresh', async (req, res, next) => {
    try {
        const refreshToken = req.cookies?.refreshToken;
        if (!refreshToken) {
            throw (0, error_middleware_1.createError)(401, 'Refresh token required', 'NO_REFRESH_TOKEN');
        }
        // Verify refresh token
        const decoded = jsonwebtoken_1.default.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        // Check if token exists in database
        const storedToken = await prisma_1.prisma.refreshToken.findFirst({
            where: {
                token: refreshToken,
                userId: decoded.id,
                expiresAt: { gt: new Date() },
            },
        });
        if (!storedToken) {
            throw (0, error_middleware_1.createError)(401, 'Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN');
        }
        // Delete old refresh token
        await prisma_1.prisma.refreshToken.delete({ where: { id: storedToken.id } });
        // Generate new tokens
        const { accessToken, refreshToken: newRefreshToken } = generateTokens(decoded);
        // Save new refresh token
        await prisma_1.prisma.refreshToken.create({
            data: {
                userId: decoded.id,
                token: newRefreshToken,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
        });
        // Set cookies
        res.cookie('refreshToken', newRefreshToken, COOKIE_OPTIONS);
        res.cookie('accessToken', accessToken, ACCESS_COOKIE_OPTIONS);
        res.json({
            success: true,
            data: {
                accessToken,
            },
        });
    }
    catch (error) {
        next(error);
    }
});
// Get current user
router.get('/me', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                role: true,
                createdAt: true,
                addresses: {
                    orderBy: { isDefault: 'desc' },
                },
            },
        });
        if (!user) {
            throw (0, error_middleware_1.createError)(404, 'User not found', 'USER_NOT_FOUND');
        }
        res.json({
            success: true,
            data: user,
        });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=auth.routes.js.map