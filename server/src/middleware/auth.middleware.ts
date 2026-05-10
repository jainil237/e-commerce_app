import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { createError } from './error.middleware'
import { prisma } from '../utils/prisma'

export interface AuthRequest extends Request {
  user?: {
    id: string
    email: string
    role: 'CUSTOMER' | 'ADMIN'
  }
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
}

const ACCESS_COOKIE_OPTIONS = {
  ...COOKIE_OPTIONS,
  maxAge: 15 * 60 * 1000,
}

const getCookie = (req: Request, key: string): string | undefined => {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies
  if (cookies?.[key]) {
    return cookies[key]
  }

  const cookieHeader = req.headers.cookie
  if (!cookieHeader) {
    return undefined
  }

  for (const part of cookieHeader.split(';')) {
    const [rawKey, ...rawValueParts] = part.trim().split('=')
    if (rawKey === key) {
      return decodeURIComponent(rawValueParts.join('=') || '')
    }
  }

  return undefined
}

const verifyAccessToken = (token: string) => jwt.verify(token, process.env.JWT_SECRET!) as {
  id: string
  email: string
  role: string
}

const verifyRefreshToken = (token: string) => jwt.verify(token, process.env.JWT_REFRESH_SECRET!) as {
  id: string
  email: string
  role: string
}

const findAuthUser = async (id: string) => {
  return prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, role: true },
  })
}

const refreshAccessTokenFromRefreshCookie = async (req: Request, res: Response) => {
  const refreshToken = getCookie(req, 'refreshToken')
  if (!refreshToken) {
    return null
  }

  const decoded = verifyRefreshToken(refreshToken)
  const storedToken = await prisma.refreshToken.findFirst({
    where: {
      token: refreshToken,
      userId: decoded.id,
      expiresAt: { gt: new Date() },
    },
  })

  if (!storedToken) {
    return null
  }

  const user = await findAuthUser(decoded.id)
  if (!user) {
    return null
  }

  const newAccessToken = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: '15m' }
  )

  res.cookie('accessToken', newAccessToken, ACCESS_COOKIE_OPTIONS)
  return user
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    let token = getCookie(req, 'accessToken')
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1]
    }

    if (token) {
      try {
        const decoded = verifyAccessToken(token)
        const user = await findAuthUser(decoded.id)
        if (user) {
          req.user = user
          return next()
        }
      } catch {
        // Access token missing/expired/invalid -> try refresh flow below.
      }
    }

    const refreshedUser = await refreshAccessTokenFromRefreshCookie(req, res)
    if (refreshedUser) {
      req.user = refreshedUser
      return next()
    }

    throw createError(401, 'Authentication required', 'UNAUTHORIZED')
  } catch (error) {
    next(error)
  }
}

export const authorizeAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    return next(createError(403, 'Admin access required', 'FORBIDDEN'))
  }
  next()
}

export const optionalAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    let token = getCookie(req, 'accessToken')
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1]
    }

    if (token) {
      try {
        const decoded = verifyAccessToken(token)
        const user = await findAuthUser(decoded.id)
        if (user) {
          req.user = user
          return next()
        }
      } catch {
        // Ignore and attempt refresh fallback.
      }
    }

    const refreshedUser = await refreshAccessTokenFromRefreshCookie(req, res)
    if (refreshedUser) {
      req.user = refreshedUser
    }
    next()
  } catch {
    next()
  }
}
