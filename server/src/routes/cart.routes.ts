import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../utils/prisma'

const router = Router()

const validateCartSchema = z.object({
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().positive(),
  })),
})

// Validate cart items (check stock) — public (works for guests too)
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
      },
    })

    const validationResults = validatedData.items.map(item => {
      const product = products.find(p => p.id === item.productId)
      
      if (!product) {
        return {
          productId: item.productId,
          valid: false,
          error: 'Product not found',
        }
      }

      if (product.stock < item.quantity) {
        return {
          productId: item.productId,
          valid: false,
          error: `Only ${product.stock} items available`,
          availableStock: product.stock,
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

export default router
