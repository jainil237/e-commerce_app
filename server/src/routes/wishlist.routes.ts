import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../utils/prisma'
import { authenticate, AuthRequest } from '../middleware/auth.middleware'

const router = Router()

// All wishlist routes require authentication
router.use(authenticate)

// Get user's wishlist
router.get('/', async (req: AuthRequest, res: Response, next) => {
  try {
    const wishlistItems = await prisma.wishlist.findMany({
      where: { userId: req.user!.id },
      include: {
        product: {
          include: {
            category: { select: { id: true, name: true, slug: true } },
            images: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json({
      success: true,
      data: wishlistItems
        .filter(item => item.product.isActive)
        .map(item => ({
          ...item.product,
          price: item.product.price.toString(),
          mrp: item.product.mrp.toString(),
          discount: Math.round(
            (1 - Number(item.product.price) / Number(item.product.mrp)) * 100
          ),
          addedAt: item.createdAt,
        })),
    })
  } catch (error) {
    next(error)
  }
})

// Add product to wishlist
const addToWishlistSchema = z.object({
  productId: z.string().uuid(),
})

router.post('/', async (req: AuthRequest, res: Response, next) => {
  try {
    const { productId } = addToWishlistSchema.parse(req.body)

    // Verify product exists and is active
    const product = await prisma.product.findFirst({
      where: { id: productId, isActive: true },
    })

    if (!product) {
      res.status(404).json({
        success: false,
        message: 'Product not found',
        code: 'PRODUCT_NOT_FOUND',
      })
      return
    }

    // Upsert — idempotent add
    await prisma.wishlist.upsert({
      where: {
        userId_productId: {
          userId: req.user!.id,
          productId,
        },
      },
      create: {
        userId: req.user!.id,
        productId,
      },
      update: {}, // Already exists, no-op
    })

    res.status(201).json({
      success: true,
      message: 'Added to wishlist',
    })
  } catch (error) {
    next(error)
  }
})

// Remove product from wishlist
router.delete('/:productId', async (req: AuthRequest, res: Response, next) => {
  try {
    const { productId } = req.params

    await prisma.wishlist.deleteMany({
      where: {
        userId: req.user!.id,
        productId,
      },
    })

    res.json({
      success: true,
      message: 'Removed from wishlist',
    })
  } catch (error) {
    next(error)
  }
})

// Check if product is in wishlist
router.get('/check/:productId', async (req: AuthRequest, res: Response, next) => {
  try {
    const { productId } = req.params

    const exists = await prisma.wishlist.findUnique({
      where: {
        userId_productId: {
          userId: req.user!.id,
          productId,
        },
      },
    })

    res.json({
      success: true,
      data: { inWishlist: !!exists },
    })
  } catch (error) {
    next(error)
  }
})

// Check multiple products (batch check for product cards)
router.post('/check-batch', async (req: AuthRequest, res: Response, next) => {
  try {
    const { productIds } = req.body as { productIds: string[] }

    if (!Array.isArray(productIds) || productIds.length === 0) {
      res.json({ success: true, data: {} })
      return
    }

    const items = await prisma.wishlist.findMany({
      where: {
        userId: req.user!.id,
        productId: { in: productIds },
      },
      select: { productId: true },
    })

    const map: Record<string, boolean> = {}
    for (const id of productIds) {
      map[id] = items.some(i => i.productId === id)
    }

    res.json({
      success: true,
      data: map,
    })
  } catch (error) {
    next(error)
  }
})

export default router
