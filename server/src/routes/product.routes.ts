import { Router, Response } from 'express'
import { prisma } from '../utils/prisma'
import { optionalAuth, AuthRequest } from '../middleware/auth.middleware'
import NodeCache from 'node-cache'

const router = Router()

// Cache for 60 seconds
const cache = new NodeCache({ stdTTL: 60, checkperiod: 120 })

// Get all products with filters
router.get('/', optionalAuth, async (req, res: Response, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 12
    const category = req.query.category as string
    const search = req.query.search as string
    const sort = (req.query.sort as string) || 'newest'
    const minPrice = parseFloat(req.query.minPrice as string)
    const maxPrice = parseFloat(req.query.maxPrice as string)
    const inStock = req.query.inStock === 'true'

    const skip = (page - 1) * limit

    // Build where clause
    const where: Record<string, unknown> = {
      isActive: true,
    }

    if (category) {
      const categoryRecord = await prisma.category.findFirst({
        where: { slug: category },
      })
      if (categoryRecord) {
        where.categoryId = categoryRecord.id
      }
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { description: { contains: search } },
        { tags: { contains: search } },
      ]
    }

    const tags = req.query.tags as string
    if (tags) {
      const tagList = tags.split(',').map(t => t.trim()).filter(Boolean)
      if (tagList.length > 0) {
        where.AND = tagList.map(tag => ({
          tags: { contains: tag },
        }))
      }
    }

    if (!isNaN(minPrice) || !isNaN(maxPrice)) {
      where.price = {}
      if (!isNaN(minPrice)) {
        (where.price as Record<string, number>).gte = minPrice
      }
      if (!isNaN(maxPrice)) {
        (where.price as Record<string, number>).lte = maxPrice
      }
    }

    if (inStock) {
      where.stock = { gt: 0 }
    }

    // Build orderBy
    let orderBy: Record<string, unknown> = { createdAt: 'desc' }
    switch (sort) {
      case 'price-asc':
        orderBy = { price: 'asc' }
        break
      case 'price-desc':
        orderBy = { price: 'desc' }
        break
      case 'name':
        orderBy = { name: 'asc' }
        break
      default:
        orderBy = { createdAt: 'desc' }
    }

    // Check cache
    const cacheKey = `products:${JSON.stringify({ page, limit, category, search, sort, minPrice, maxPrice, inStock })}`
    const cached = cache.get(cacheKey)
    if (cached) {
      res.json(cached)
      return
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          category: { select: { id: true, name: true, slug: true } },
          images: { orderBy: { sortOrder: 'asc' } },
        },
      }),
      prisma.product.count({ where }),
    ])

    const response = {
      success: true,
      data: products.map(p => ({
        ...p,
        price: p.price.toString(),
        mrp: p.mrp.toString(),
        discount: Math.round((1 - Number(p.price) / Number(p.mrp)) * 100),
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    }

    cache.set(cacheKey, response)
    res.json(response)
  } catch (error) {
    next(error)
  }
})

// Get price range for filter bounds
router.get('/price-range', async (_req, res: Response, next) => {
  try {
    const cacheKey = 'products:price-range'
    const cached = cache.get(cacheKey)
    if (cached) {
      res.json(cached)
      return
    }

    const result = await prisma.product.aggregate({
      where: { isActive: true },
      _min: { price: true },
      _max: { price: true },
    })

    const response = {
      success: true,
      data: {
        min: result._min.price?.toString() || '0',
        max: result._max.price?.toString() || '0',
      },
    }

    cache.set(cacheKey, response)
    res.json(response)
  } catch (error) {
    next(error)
  }
})

// Get featured products
router.get('/featured', optionalAuth, async (_req, res: Response, next) => {
  try {
    const cacheKey = 'products:featured'
    const cached = cache.get(cacheKey)
    if (cached) {
      res.json(cached)
      return
    }

    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        isFeatured: true,
      },
      take: 8,
      include: {
        category: { select: { id: true, name: true, slug: true } },
        images: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    })

    const response = {
      success: true,
      data: products.map(p => ({
        ...p,
        price: p.price.toString(),
        mrp: p.mrp.toString(),
        discount: Math.round((1 - Number(p.price) / Number(p.mrp)) * 100),
      })),
    }

    cache.set(cacheKey, response)
    res.json(response)
  } catch (error) {
    next(error)
  }
})

// Get predictive search suggestions
router.get('/suggestions', optionalAuth, async (req, res: Response, next) => {
  try {
    const q = (req.query.q as string || '').trim()
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 6, 1), 20)

    if (q.length < 2) {
      res.json({
        success: true,
        data: [],
      })
      return
    }

    const cacheKey = `products:suggestions:${q.toLowerCase()}:${limit}`
    const cached = cache.get(cacheKey)
    if (cached) {
      res.json(cached)
      return
    }

    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        OR: [
          { name: { contains: q } },
          { description: { contains: q } },
          { tags: { contains: q } },
          { category: { name: { contains: q } } },
        ],
      },
      take: limit,
      include: {
        category: { select: { name: true, slug: true } },
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
      },
      orderBy: [
        { isFeatured: 'desc' },
        { createdAt: 'desc' },
      ],
    })

    const response = {
      success: true,
      data: products.map(product => ({
        id: product.id,
        name: product.name,
        slug: product.slug,
        price: product.price.toString(),
        mrp: product.mrp.toString(),
        category: product.category,
        image: product.images[0]?.url || null,
      })),
    }

    cache.set(cacheKey, response)
    res.json(response)
  } catch (error) {
    next(error)
  }
})

// Get single product by slug
router.get('/:slug', optionalAuth, async (req, res: Response, next) => {
  try {
    const { slug } = req.params

    const product = await prisma.product.findUnique({
      where: { slug },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        images: { orderBy: { sortOrder: 'asc' } },
      },
    })

    if (!product || !product.isActive) {
      res.status(404).json({
        success: false,
        message: 'Product not found',
        code: 'PRODUCT_NOT_FOUND',
      })
      return
    }

    res.json({
      success: true,
      data: {
        ...product,
        price: product.price.toString(),
        mrp: product.mrp.toString(),
        discount: Math.round((1 - Number(product.price) / Number(product.mrp)) * 100),
      },
    })
  } catch (error) {
    next(error)
  }
})

export default router
