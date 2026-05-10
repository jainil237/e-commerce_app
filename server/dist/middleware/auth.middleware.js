"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.optionalAuth = exports.authorizeAdmin = exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const error_middleware_1 = require("./error.middleware");
const prisma_1 = require("../utils/prisma");
const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
};
const ACCESS_COOKIE_OPTIONS = {
    ...COOKIE_OPTIONS,
    maxAge: 15 * 60 * 1000,
};
const getCookie = (req, key) => {
    const cookies = req.cookies;
    if (cookies?.[key]) {
        return cookies[key];
    }
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) {
        return undefined;
    }
    for (const part of cookieHeader.split(';')) {
        const [rawKey, ...rawValueParts] = part.trim().split('=');
        if (rawKey === key) {
            return decodeURIComponent(rawValueParts.join('=') || '');
        }
    }
    return undefined;
};
const verifyAccessToken = (token) => jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
const verifyRefreshToken = (token) => jsonwebtoken_1.default.verify(token, process.env.JWT_REFRESH_SECRET);
const findAuthUser = async (id) => {
    return prisma_1.prisma.user.findUnique({
        where: { id },
        select: { id: true, email: true, role: true },
    });
};
const refreshAccessTokenFromRefreshCookie = async (req, res) => {
    const refreshToken = getCookie(req, 'refreshToken');
    if (!refreshToken) {
        return null;
    }
    const decoded = verifyRefreshToken(refreshToken);
    const storedToken = await prisma_1.prisma.refreshToken.findFirst({
        where: {
            token: refreshToken,
            userId: decoded.id,
            expiresAt: { gt: new Date() },
        },
    });
    if (!storedToken) {
        return null;
    }
    const user = await findAuthUser(decoded.id);
    if (!user) {
        return null;
    }
    const newAccessToken = jsonwebtoken_1.default.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '15m' });
    res.cookie('accessToken', newAccessToken, ACCESS_COOKIE_OPTIONS);
    return user;
};
const authenticate = async (req, res, next) => {
    try {
        let token = getCookie(req, 'accessToken');
        if (!token && req.headers.authorization?.startsWith('Bearer ')) {
            token = req.headers.authorization.split(' ')[1];
        }
        if (token) {
            try {
                const decoded = verifyAccessToken(token);
                const user = await findAuthUser(decoded.id);
                if (user) {
                    req.user = user;
                    return next();
                }
            }
            catch {
                // Access token missing/expired/invalid -> try refresh flow below.
            }
        }
        const refreshedUser = await refreshAccessTokenFromRefreshCookie(req, res);
        if (refreshedUser) {
            req.user = refreshedUser;
            return next();
        }
        throw (0, error_middleware_1.createError)(401, 'Authentication required', 'UNAUTHORIZED');
    }
    catch (error) {
        next(error);
    }
};
exports.authenticate = authenticate;
const authorizeAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'ADMIN') {
        return next((0, error_middleware_1.createError)(403, 'Admin access required', 'FORBIDDEN'));
    }
    next();
};
exports.authorizeAdmin = authorizeAdmin;
const optionalAuth = async (req, res, next) => {
    try {
        let token = getCookie(req, 'accessToken');
        if (!token && req.headers.authorization?.startsWith('Bearer ')) {
            token = req.headers.authorization.split(' ')[1];
        }
        if (token) {
            try {
                const decoded = verifyAccessToken(token);
                const user = await findAuthUser(decoded.id);
                if (user) {
                    req.user = user;
                    return next();
                }
            }
            catch {
                // Ignore and attempt refresh fallback.
            }
        }
        const refreshedUser = await refreshAccessTokenFromRefreshCookie(req, res);
        if (refreshedUser) {
            req.user = refreshedUser;
        }
        next();
    }
    catch {
        next();
    }
};
exports.optionalAuth = optionalAuth;
//# sourceMappingURL=auth.middleware.js.map