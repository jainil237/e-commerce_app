import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../utils/prisma'
import { createError } from '../middleware/error.middleware'

const router = Router()

const validateCouponSchema = z.object({
  code: z.string().min(1),
  orderValue: z.number().positive(),
})

// Validate coupon
router.post('/validate', async (req, res: Response, next) => {
  try {
    const validatedData = validateCouponSchema.parse(req.body)

    const coupon = await prisma.coupon.findUnique({
      where: { code: validatedData.code.toUpperCase() },
    })

    if (!coupon || !coupon.isActive) {
      throw createError(400, 'Invalid coupon code', 'INVALID_COUPON')
    }

    // Check expiry
    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      throw createError(400, 'Coupon has expired', 'COUPON_EXPIRED')
    }

    // Check usage limit
    if (coupon.maxUsage && coupon.usedCount >= coupon.maxUsage) {
      throw createError(400, 'Coupon usage limit reached', 'COUPON_LIMIT_REACHED')
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

export default router
