import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../utils/prisma'
import { getStoreConfig } from '../utils/config'
import { createError } from '../middleware/error.middleware'
import { authenticate, AuthRequest } from '../middleware/auth.middleware'

const router = Router()

const validateCartSchema = z.object({
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().positive(),
  })),
})

// Validate cart items — public (works for guests too)
// Returns availableStock considering all active reservations
router.post('/validate', async (req, res: Response, next) => {
  try {
    const validatedData = validateCartSchema.parse(req.body)
    const productIds = validatedData.items.map(item => item.productId)

    const products = await prisma.product.findMany({
      where: {
        id: { in: productIds },
        isActive: true,
      },
      include: {
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        stockReservations: {
          where: {
            status: 'ACTIVE',
            expiresAt: { gt: new Date() },
          },
          select: { quantity: true },
        },
      },
    })

    const validationResults = validatedData.items.map(item => {
      const product = products.find(p => p.id === item.productId)

      if (!product) {
        return {
          productId: item.productId,
          valid: false,
          error: 'Product not found or discontinued',
        }
      }

      const reservedQty = product.stockReservations.reduce((sum, r) => sum + r.quantity, 0)
      const availableStock = product.stock - reservedQty

      if (availableStock < item.quantity) {
        return {
          productId: item.productId,
          valid: false,
          error: `Only ${availableStock} items available`,
          availableStock,
          product: {
            id: product.id,
            name: product.name,
            slug: product.slug,
            price: product.price.toString(),
            mrp: product.mrp.toString(),
            stock: product.stock,
            availableStock,
            gstPercent: product.gstPercent,
            images: product.images.map(img => ({ url: img.url })),
          },
        }
      }

      return {
        productId: item.productId,
        valid: true,
        availableStock,
        product: {
          id: product.id,
          name: product.name,
          slug: product.slug,
          price: product.price.toString(),
          mrp: product.mrp.toString(),
          stock: product.stock,
          availableStock,
          gstPercent: product.gstPercent,
          images: product.images.map(img => ({ url: img.url })),
        },
      }
    })

    const allValid = validationResults.every(r => r.valid)

    res.json({
      success: true,
      data: {
        valid: allValid,
        items: validationResults,
      },
    })
  } catch (error) {
    next(error)
  }
})

// Build where clause for finding a user's reservation
function getUserReservationWhere(userId: string | undefined, sessionId: string | undefined) {
  const orConditions: Array<Record<string, string>> = []
  if (userId) orConditions.push({ userId })
  if (sessionId) orConditions.push({ sessionId })
  return orConditions.length > 0 ? { OR: orConditions } : null
}

// Lock product row using SELECT ... FOR UPDATE to prevent race conditions
async function lockProduct(tx: any, productId: string) {
  await tx.$executeRaw`SELECT id FROM Product WHERE id = ${productId} FOR UPDATE`
}

// Get available stock inside a locked transaction
async function getAvailableStockLocked(tx: any, productId: string) {
  const product = await tx.product.findUnique({ where: { id: productId } })
  if (!product) return { product: null as any, availableStock: 0 }

  const reserved = await tx.stockReservation.aggregate({
    where: {
      productId,
      status: 'ACTIVE',
      expiresAt: { gt: new Date() },
    },
    _sum: { quantity: true },
  })

  const availableStock = product.stock - (reserved._sum.quantity || 0)
  return { product, availableStock }
}

// Add item to cart with stock validation and reservation
const addToCartSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive().max(100),
  sessionId: z.string().optional(), // for guest users
})

router.post('/add', async (req, res: Response, next) => {
  try {
    const validatedData = addToCartSchema.parse(req.body)
    const config = getStoreConfig()
    const userId = (req as AuthRequest).user?.id
    const sessionId = validatedData.sessionId

    const result = await prisma.$transaction(async (tx) => {
      // Acquire row-level lock on product to prevent concurrent overselling
      await lockProduct(tx, validatedData.productId)

      const { product, availableStock } = await getAvailableStockLocked(tx, validatedData.productId)

      if (!product || !product.isActive) {
        throw createError(404, 'Product not found or unavailable', 'PRODUCT_NOT_FOUND')
      }

      // Find existing reservation for this user/session
      const userWhere = getUserReservationWhere(userId, sessionId)
      const existingRes = userWhere
        ? await tx.stockReservation.findFirst({
            where: {
              productId: validatedData.productId,
              status: 'ACTIVE',
              expiresAt: { gt: new Date() },
              ...userWhere,
            },
          })
        : null

      const currentReservedQty = existingRes?.quantity || 0
      const totalRequested = currentReservedQty + validatedData.quantity
      const maxForThisUser = availableStock + currentReservedQty

      if (totalRequested > maxForThisUser) {
        throw createError(
          400,
          `Only ${Math.max(0, availableStock)} items available`,
          'INSUFFICIENT_STOCK'
        )
      }

      const useReservation = product.stock <= config.inventory.stockLockThreshold

      if (useReservation) {
        const expiresAt = new Date(Date.now() + config.inventory.reservationDurationMinutes * 60 * 1000)

        if (existingRes) {
          await tx.stockReservation.update({
            where: { id: existingRes.id },
            data: { quantity: totalRequested, expiresAt },
          })
        } else {
          await tx.stockReservation.create({
            data: {
              productId: validatedData.productId,
              userId: userId || null,
              sessionId: sessionId || null,
              quantity: totalRequested,
              expiresAt,
            },
          })
        }
      }

      return { product, reserved: useReservation, totalRequested }
    })

    res.json({
      success: true,
      data: {
        productId: result.product.id,
        name: result.product.name,
        price: result.product.price.toString(),
        reserved: result.reserved,
        quantity: result.totalRequested,
      },
    })
  } catch (error) {
    next(error)
  }
})

// Update cart quantity with stock validation
const updateQuantitySchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(0).max(100),
  sessionId: z.string().optional(),
})

router.post('/update-quantity', async (req, res: Response, next) => {
  try {
    const validatedData = updateQuantitySchema.parse(req.body)
    const config = getStoreConfig()
    const userId = (req as AuthRequest).user?.id
    const sessionId = validatedData.sessionId

    const result = await prisma.$transaction(async (tx) => {
      await lockProduct(tx, validatedData.productId)

      const { product, availableStock } = await getAvailableStockLocked(tx, validatedData.productId)

      if (!product || !product.isActive) {
        throw createError(404, 'Product not found or unavailable', 'PRODUCT_NOT_FOUND')
      }

      const userWhere = getUserReservationWhere(userId, sessionId)

      // If quantity is 0, release reservation
      if (validatedData.quantity === 0) {
        if (userWhere) {
          await tx.stockReservation.deleteMany({
            where: {
              productId: validatedData.productId,
              status: 'ACTIVE',
              ...userWhere,
            },
          })
        }
        return { action: 'released' as const }
      }

      const existingRes = userWhere
        ? await tx.stockReservation.findFirst({
            where: {
              productId: validatedData.productId,
              status: 'ACTIVE',
              expiresAt: { gt: new Date() },
              ...userWhere,
            },
          })
        : null

      const currentReservedQty = existingRes?.quantity || 0
      const maxForThisUser = availableStock + currentReservedQty

      if (validatedData.quantity > maxForThisUser) {
        throw createError(
          400,
          `Only ${Math.max(0, availableStock)} items available`,
          'INSUFFICIENT_STOCK'
        )
      }

      const useReservation = product.stock <= config.inventory.stockLockThreshold

      if (useReservation) {
        const expiresAt = new Date(Date.now() + config.inventory.reservationDurationMinutes * 60 * 1000)

        if (existingRes) {
          await tx.stockReservation.update({
            where: { id: existingRes.id },
            data: { quantity: validatedData.quantity, expiresAt },
          })
        } else {
          await tx.stockReservation.create({
            data: {
              productId: validatedData.productId,
              userId: userId || null,
              sessionId: sessionId || null,
              quantity: validatedData.quantity,
              expiresAt,
            },
          })
        }
      }

      return { action: 'updated' as const, quantity: validatedData.quantity, reserved: useReservation }
    })

    res.json({
      success: true,
      data: {
        updated: result.action === 'updated',
        released: result.action === 'released',
        quantity: result.action === 'updated' ? result.quantity : 0,
      },
    })
  } catch (error) {
    next(error)
  }
})

// Remove item from cart (release reservation)
const removeItemSchema = z.object({
  productId: z.string().uuid(),
  sessionId: z.string().optional(),
})

router.post('/remove', async (req, res: Response, next) => {
  try {
    const validatedData = removeItemSchema.parse(req.body)
    const userId = (req as AuthRequest).user?.id
    const sessionId = validatedData.sessionId

    const userWhere = getUserReservationWhere(userId, sessionId)

    if (userWhere) {
      await prisma.stockReservation.deleteMany({
        where: {
          productId: validatedData.productId,
          status: 'ACTIVE',
          ...userWhere,
        },
      })
    }

    res.json({ success: true, data: { removed: true } })
  } catch (error) {
    next(error)
  }
})

// Snapshot endpoint — bulk fetch inventory for frontend caching
const snapshotSchema = z.object({
  productIds: z.array(z.string().uuid()).min(1).max(50),
})

router.post('/snapshot', async (req, res: Response, next) => {
  try {
    const { productIds } = snapshotSchema.parse(req.body)

    const products = await prisma.product.findMany({
      where: {
        id: { in: productIds },
        isActive: true,
      },
      select: {
        id: true,
        stock: true,
        sku: true,
        isActive: true,
        updatedAt: true,
        stockReservations: {
          where: {
            status: 'ACTIVE',
            expiresAt: { gt: new Date() },
          },
          select: { quantity: true },
        },
      },
    })

    const snapshots = products.map(p => {
      const reservedQty = p.stockReservations.reduce((sum, r) => sum + r.quantity, 0)
      return {
        skuId: p.id,
        sku: p.sku,
        availableQty: Math.max(0, p.stock - reservedQty),
        updatedAt: p.updatedAt.toISOString(),
        isActive: p.isActive,
      }
    })

    res.json({
      success: true,
      data: { snapshots },
    })
  } catch (error) {
    next(error)
  }
})

// Strict checkout validation with row-level locking
const validateCheckoutSchema = z.object({
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().positive(),
  })).min(1),
  sessionId: z.string().optional(),
})

router.post('/validate-checkout', async (req, res: Response, next) => {
  try {
    const validatedData = validateCheckoutSchema.parse(req.body)
    const userId = (req as AuthRequest).user?.id
    const sessionId = validatedData.sessionId
    const productIds = validatedData.items.map(i => i.productId)

    const result = await prisma.$transaction(async (tx) => {
      // Lock all products in consistent order to prevent deadlocks
      const sortedIds = [...productIds].sort()
      for (const id of sortedIds) {
        await lockProduct(tx, id)
      }

      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
        include: {
          images: { orderBy: { sortOrder: 'asc' }, take: 1 },
          stockReservations: {
            where: {
              status: 'ACTIVE',
              expiresAt: { gt: new Date() },
            },
            select: { userId: true, sessionId: true, quantity: true },
          },
        },
      })

      const validationResults = validatedData.items.map(item => {
        const product = products.find(p => p.id === item.productId)

        if (!product) {
          return {
            productId: item.productId,
            valid: false,
            error: 'Product not found or discontinued',
          }
        }

        if (!product.isActive) {
          return {
            productId: item.productId,
            valid: false,
            error: 'Product is no longer available',
          }
        }

        // Determine which reservations belong to this user/session
        const isUserReservation = (r: { userId: string | null; sessionId: string | null }) => {
          if (userId && r.userId === userId) return true
          if (sessionId && r.sessionId === sessionId) return true
          return false
        }

        const otherResQty = product.stockReservations
          .filter(r => !isUserReservation(r))
          .reduce((sum, r) => sum + r.quantity, 0)

        const availableStock = product.stock - otherResQty

        if (availableStock < item.quantity) {
          return {
            productId: item.productId,
            valid: false,
            error: `Only ${Math.max(0, availableStock)} items available`,
            availableStock: Math.max(0, availableStock),
            product: {
              id: product.id,
              name: product.name,
              slug: product.slug,
              price: product.price.toString(),
              mrp: product.mrp.toString(),
              stock: product.stock,
              gstPercent: product.gstPercent,
              images: product.images.map(img => ({ url: img.url })),
            },
          }
        }

        return {
          productId: item.productId,
          valid: true,
          availableStock,
          product: {
            id: product.id,
            name: product.name,
            slug: product.slug,
            price: product.price.toString(),
            mrp: product.mrp.toString(),
            stock: product.stock,
            gstPercent: product.gstPercent,
            images: product.images.map(img => ({ url: img.url })),
          },
        }
      })

      const allValid = validationResults.every(r => r.valid)
      return { allValid, items: validationResults }
    })

    res.json({
      success: true,
      data: {
        valid: result.allValid,
        items: result.items,
      },
    })
  } catch (error) {
    next(error)
  }
})

// Convert reservations to order (called during checkout)
router.post('/convert-to-order', authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { items } = req.body as { items: Array<{ productId: string; quantity: number }> }
    const userId = req.user!.id

    await prisma.$transaction(async (tx) => {
      // Lock all products in consistent order to prevent deadlocks
      const sortedIds = items.map(i => i.productId).sort()
      for (const id of sortedIds) {
        await lockProduct(tx, id)
      }

      for (const item of items) {
        const { product, availableStock } = await getAvailableStockLocked(tx, item.productId)

        if (!product || !product.isActive) {
          throw createError(404, `Product not found for ${item.productId}`, 'PRODUCT_NOT_FOUND')
        }

        // Count this user's existing reservation toward available stock
        const userRes = await tx.stockReservation.findFirst({
          where: {
            productId: item.productId,
            userId,
            status: 'ACTIVE',
            expiresAt: { gt: new Date() },
          },
        })
        const userReservedQty = userRes?.quantity || 0
        const effectiveAvailable = availableStock + userReservedQty

        if (effectiveAvailable < item.quantity) {
          throw createError(400, `Insufficient stock for ${product.name}`, 'INSUFFICIENT_STOCK')
        }

        // Deduct stock
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        })

        // Mark user's reservations as converted
        await tx.stockReservation.updateMany({
          where: {
            productId: item.productId,
            userId,
            status: 'ACTIVE',
          },
          data: { status: 'CONVERTED' },
        })
      }
    })

    res.json({ success: true, data: { converted: true } })
  } catch (error) {
    next(error)
  }
})

// Cleanup expired reservations (call via cron job)
router.post('/cleanup-expired', async (req, res: Response, next) => {
  try {
    const result = await prisma.stockReservation.updateMany({
      where: {
        status: 'ACTIVE',
        expiresAt: { lte: new Date() },
      },
      data: { status: 'EXPIRED' },
    })

    res.json({
      success: true,
      data: { expiredCount: result.count },
    })
  } catch (error) {
    next(error)
  }
})

export default router
