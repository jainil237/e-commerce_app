import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../utils/prisma'
import { createError } from '../middleware/error.middleware'
import { optionalAuth } from '../middleware/auth.middleware'

const router = Router()

/** Lock product row using SELECT ... FOR UPDATE to prevent race conditions */
async function lockProduct(tx: any, productId: string) {
  await tx.$executeRaw`SELECT id FROM Product WHERE id = ${productId} FOR UPDATE`
}

// ─── Snapshot endpoint (Frontend Inventory Source of Truth) ───
const snapshotSchema = z.object({
  productIds: z.array(z.string().uuid()).min(1).max(50),
  sessionId: z.string().optional(),
})

router.post('/snapshot', optionalAuth, async (req, res: Response, next) => {
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
      },
    })

    const snapshots = products.map(p => {
      return {
        skuId: p.id,
        sku: p.sku,
        availableQty: p.stock,
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

// ─── Validate before checkout ───
const validateCheckoutSchema = z.object({
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().positive(),
  })),
  sessionId: z.string().optional(),
})

router.post('/validate-checkout', optionalAuth, async (req, res: Response, next) => {
  try {
    const validatedData = validateCheckoutSchema.parse(req.body)
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

        const available = product.stock

        if (available < item.quantity) {
          return {
            productId: item.productId,
            valid: false,
            error: `Only ${available} items available`,
            availableStock: available,
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
          availableStock: available,
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

export default router
