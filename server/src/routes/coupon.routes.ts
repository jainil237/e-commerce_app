import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../utils/prisma'
import { createError } from '../middleware/error.middleware'
import { optionalAuth, AuthRequest } from '../middleware/auth.middleware'

const router = Router()

const validateCouponSchema = z.object({
  code: z.string().min(1),
  orderValue: z.number().positive(),
})

// Validate coupon
router.post('/validate', optionalAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const validatedData = validateCouponSchema.parse(req.body)

    const coupon = await prisma.coupon.findUnique({
      where: { code: validatedData.code.toUpperCase() },
    })

    if (!coupon || !coupon.isActive) {
      throw createError(400, 'Invalid coupon code', 'INVALID_COUPON')
    }

    // Check validFrom
    if (coupon.validFrom && coupon.validFrom > new Date()) {
      throw createError(400, 'Coupon is not yet active', 'COUPON_NOT_ACTIVE')
    }

    // Check expiry
    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      throw createError(400, 'Coupon has expired', 'COUPON_EXPIRED')
    }

    // Check global usage limit
    if (coupon.maxUsage && coupon.usedCount >= coupon.maxUsage) {
      throw createError(400, 'Coupon total usage limit reached', 'COUPON_LIMIT_REACHED')
    }

    // Check per-user usage limit if logged in
    if (req.user) {
      const usage = await prisma.couponUsage.findUnique({
        where: {
          couponId_userId: {
            couponId: coupon.id,
            userId: req.user.id,
          },
        },
      })

      if (usage && coupon.perUserLimit && usage.usedCount >= coupon.perUserLimit) {
        throw createError(400, 'You have reached the usage limit for this coupon', 'USER_COUPON_LIMIT_REACHED')
      }
    }

    // Check minimum order value
    if (coupon.minOrderValue && validatedData.orderValue < Number(coupon.minOrderValue)) {
      throw createError(
        400,
        `Minimum order value ₹${coupon.minOrderValue} required`,
        'COUPON_MIN_ORDER'
      )
    }

    // Calculate discount
    let discount: number
    if (coupon.discountType === 'PERCENTAGE') {
      discount = validatedData.orderValue * (Number(coupon.discountValue) / 100)
    } else {
      discount = Number(coupon.discountValue)
    }

    res.json({
      success: true,
      data: {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue.toString(),
        calculatedDiscount: discount.toFixed(2),
        minOrderValue: coupon.minOrderValue?.toString() || null,
      },
    })
  } catch (error) {
    next(error)
  }
})

// Get available coupons for a cart
router.get('/available', optionalAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const orderValue = parseFloat(req.query.orderValue as string) || 0

    const coupons = await prisma.coupon.findMany({
      where: {
        isActive: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
        AND: [
          {
            OR: [
              { validFrom: null },
              { validFrom: { lte: new Date() } },
            ]
          },
          {
            OR: [
              { minOrderValue: null },
              { minOrderValue: { lte: orderValue } },
            ]
          }
        ]
      },
    })

    // Filter by usage limit
    const availableCoupons = []
    for (const coupon of coupons) {
      // Check global limit
      if (coupon.maxUsage && coupon.usedCount >= coupon.maxUsage) continue

      // Check user limit
      if (req.user) {
        const usage = await prisma.couponUsage.findUnique({
          where: {
            couponId_userId: {
              couponId: coupon.id,
              userId: req.user.id,
            },
          },
        })
        if (usage && coupon.perUserLimit && usage.usedCount >= coupon.perUserLimit) continue
      }

      availableCoupons.push({
        id: coupon.id,
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue.toString(),
        minOrderValue: coupon.minOrderValue?.toString() || null,
        expiresAt: coupon.expiresAt,
      })
    }

    res.json({
      success: true,
      data: availableCoupons,
    })
  } catch (error) {
    next(error)
  }
})

export default router
