import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../utils/prisma'
import { createError } from '../middleware/error.middleware'
import { optionalAuth, AuthRequest } from '../middleware/auth.middleware'

const router = Router()

const cartItemsSchema = z
  .array(
    z.object({
      productId: z.string().uuid(),
      quantity: z.number().int().positive(),
    })
  )
  .min(1)

// R4 (S-21/W-07): both coupon endpoints used to trust a client-supplied
// orderValue number for the minOrderValue gate and the discount preview —
// display could show a discount the shopper wasn't actually entitled to.
// There is no persisted server-side cart to resolve from (Epic 2/E4 is out
// of scope for this chain), so the smallest contract that lets the server
// compute a real number is the cart's line items, priced from the DB the
// same way order creation prices them.
async function computeServerSubtotal(items: { productId: string; quantity: number }[]): Promise<number> {
  const products = await prisma.product.findMany({
    where: { id: { in: items.map((i) => i.productId) }, isActive: true },
    select: { id: true, price: true },
  })
  const priceById = new Map(products.map((p) => [p.id, Number(p.price)]))

  let subtotal = 0
  for (const item of items) {
    const price = priceById.get(item.productId)
    if (price === undefined) continue // unknown/inactive product — this endpoint is preview-only; order creation is the authoritative check
    subtotal += price * item.quantity
  }
  return subtotal
}

const validateCouponSchema = z.object({
  code: z.string().min(1),
  items: cartItemsSchema,
})

// Validate coupon
router.post('/validate', optionalAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const validatedData = validateCouponSchema.parse(req.body)
    const orderValue = await computeServerSubtotal(validatedData.items)

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
    if (coupon.minOrderValue && orderValue < Number(coupon.minOrderValue)) {
      throw createError(
        400,
        `Minimum order value ₹${coupon.minOrderValue} required`,
        'COUPON_MIN_ORDER'
      )
    }

    // Calculate discount
    let discount: number
    if (coupon.discountType === 'PERCENTAGE') {
      discount = orderValue * (Number(coupon.discountValue) / 100)
    } else {
      discount = Number(coupon.discountValue)
    }
    discount = Math.min(discount, orderValue) // R4 — preview can't promise more than the cart is worth

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

const availableCouponsSchema = z.object({
  items: cartItemsSchema,
})

// Get available coupons for a cart
router.post('/available', optionalAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const { items } = availableCouponsSchema.parse(req.body)
    const orderValue = await computeServerSubtotal(items)

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
