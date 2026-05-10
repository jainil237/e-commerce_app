import { Request, Response, NextFunction } from 'express'

export interface ApiError extends Error {
  statusCode?: number
  code?: string
}

export const errorHandler = (
  err: ApiError,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  const isDev = process.env.NODE_ENV === 'development'
  const statusCode = err.statusCode || 500
  const isServerError = statusCode >= 500
  const code = err.code || (isServerError ? 'INTERNAL_ERROR' : 'ERROR')
  const message = isServerError
    ? (isDev ? (err.message || 'Internal Server Error') : 'Something went wrong. Please try again later.')
    : (err.message || 'Request failed')

  console.error(`[${new Date().toISOString()}] Error:`, {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
  })

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
  })
}

export const notFound = (req: Request, res: Response, next: NextFunction) => {
  const isDev = process.env.NODE_ENV === 'development'
  const error: ApiError = new Error(isDev ? `Not Found - ${req.originalUrl}` : 'Route not found')
  error.statusCode = 404
  error.code = 'NOT_FOUND'
  next(error)
}

export const createError = (statusCode: number, message: string, code?: string): ApiError => {
  const error: ApiError = new Error(message)
  error.statusCode = statusCode
  error.code = code || 'ERROR'
  return error
}
