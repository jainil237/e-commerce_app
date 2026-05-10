"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createError = exports.notFound = exports.errorHandler = void 0;
const errorHandler = (err, req, res, _next) => {
    const isDev = process.env.NODE_ENV === 'development';
    const statusCode = err.statusCode || 500;
    const isServerError = statusCode >= 500;
    const code = err.code || (isServerError ? 'INTERNAL_ERROR' : 'ERROR');
    const message = isServerError
        ? (isDev ? (err.message || 'Internal Server Error') : 'Something went wrong. Please try again later.')
        : (err.message || 'Request failed');
    console.error(`[${new Date().toISOString()}] Error:`, {
        message: err.message,
        stack: err.stack,
        url: req.originalUrl,
        method: req.method,
    });
    res.status(statusCode).json({
        success: false,
        message,
        code,
        ...(isDev && {
            stack: err.stack,
            details: {
                method: req.method,
                path: req.originalUrl,
            },
        }),
    });
};
exports.errorHandler = errorHandler;
const notFound = (req, res, next) => {
    const isDev = process.env.NODE_ENV === 'development';
    const error = new Error(isDev ? `Not Found - ${req.originalUrl}` : 'Route not found');
    error.statusCode = 404;
    error.code = 'NOT_FOUND';
    next(error);
};
exports.notFound = notFound;
const createError = (statusCode, message, code) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code || 'ERROR';
    return error;
};
exports.createError = createError;
//# sourceMappingURL=error.middleware.js.map