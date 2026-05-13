import { Router, Response } from 'express'
import { z } from 'zod'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { prisma } from '../utils/prisma'
import { authenticate, authorizeAdmin, AuthRequest } from '../middleware/auth.middleware'
import { createError } from '../middleware/error.middleware'
import { getStoreConfig, getTrackingUrl } from '../utils/config'
import { uploadProductImages } from '../services/image-upload.service'
import { sendShippingUpdateEmail } from '../services/email.service'
import { getActiveProvider } from '../services/storage.service'
import { isR2Enabled } from '../services/r2.service'
import { isCloudinaryEnabled } from '../services/cloudinary.service'

const router = Router()

// All admin routes require authentication and admin role
router.use(authenticate)
router.use(authorizeAdmin)

const storage = multer.memoryStorage()

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG, and WebP images are allowed'))
    }
    cb(null, true)
  },
})

// ==================== Dashboard ====================

router.get('/dashboard/summary', async (req, res: Response, next) => {
  try {
    const month = parseInt(req.query.month as string) || (new Date().getMonth() + 1)
    const year = parseInt(req.query.year as string) || new Date().getFullYear()

    const currentStart = new Date(year, month - 1, 1)
    const currentEnd = new Date(year, month, 0, 23, 59, 59, 999)

    // Calculate previous month
    let prevMonth = month - 1
    let prevYear = year
    if (prevMonth === 0) {
      prevMonth = 12
      prevYear -= 1
    }
    const prevStart = new Date(prevYear, prevMonth - 1, 1)
    const prevEnd = new Date(prevYear, prevMonth, 0, 23, 59, 59, 999)

    const [
      currentRevenue, 
      currentOrders, 
      currentProducts, 
      currentUsers,
      prevRevenue,
      prevOrders,
      prevProducts,
      prevUsers
    ] = await Promise.all([
      // Current Period
      prisma.order.aggregate({
        where: { paymentStatus: 'PAID', createdAt: { gte: currentStart, lte: currentEnd } },
        _sum: { total: true },
      }),
      prisma.order.count({
        where: { createdAt: { gte: currentStart, lte: currentEnd } },
      }),
      prisma.orderItem.groupBy({
        by: ['productId'],
        where: { order: { createdAt: { gte: currentStart, lte: currentEnd }, paymentStatus: 'PAID' } },
      }),
      prisma.user.count({
        where: { role: 'CUSTOMER', createdAt: { gte: currentStart, lte: currentEnd } },
      }),
      // Previous Period
      prisma.order.aggregate({
        where: { paymentStatus: 'PAID', createdAt: { gte: prevStart, lte: prevEnd } },
        _sum: { total: true },
      }),
      prisma.order.count({
        where: { createdAt: { gte: prevStart, lte: prevEnd } },
      }),
      prisma.orderItem.groupBy({
        by: ['productId'],
        where: { order: { createdAt: { gte: prevStart, lte: prevEnd }, paymentStatus: 'PAID' } },
      }),
      prisma.user.count({
        where: { role: 'CUSTOMER', createdAt: { gte: prevStart, lte: prevEnd } },
      }),
    ])

    const calculateChange = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0
      return parseFloat(((current - previous) / previous * 100).toFixed(1))
    }

    const currRevValue = Number(currentRevenue._sum.total || 0)
    const prevRevValue = Number(prevRevenue._sum.total || 0)

    res.json({
      success: true,
      data: {
        revenue: {
          value: currRevValue,
          change: calculateChange(currRevValue, prevRevValue)
        },
        orders: {
          value: currentOrders,
          change: calculateChange(currentOrders, prevOrders)
        },
        products: {
          value: currentProducts.length,
          change: calculateChange(currentProducts.length, prevProducts.length)
        },
        customers: {
          value: currentUsers,
          change: calculateChange(currentUsers, prevUsers)
        }
      },
    })
  } catch (error) {
    next(error)
  }
})

router.get('/dashboard/revenue-weekly', async (req, res: Response, next) => {
  try {
    const month = parseInt(req.query.month as string) || (new Date().getMonth() + 1)
    const year = parseInt(req.query.year as string) || new Date().getFullYear()

    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 0, 23, 59, 59, 999)

    const orders = await prisma.order.findMany({
      where: {
        paymentStatus: 'PAID',
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        total: true,
        createdAt: true,
      },
    })

    // Group by week
    const grouped: Record<string, number> = {}
    
    // Initialize all weeks of the month to 0
    // A month can have up to 6 weeks depending on how you split it
    // We'll use "Week X" of the month
    const lastDay = endDate.getDate()
    for (let i = 1; i <= Math.ceil(lastDay / 7); i++) {
      grouped[`Week ${i}`] = 0
    }

    for (const order of orders) {
      const date = new Date(order.createdAt)
      const weekOfMonth = Math.ceil(date.getDate() / 7)
      const key = `Week ${weekOfMonth}`
      grouped[key] = (grouped[key] || 0) + Number(order.total)
    }

    const chartData = Object.entries(grouped)
      .map(([week, revenue]) => ({ name: week, revenue: Number(revenue.toFixed(2)) }))
      .sort((a, b) => a.name.localeCompare(b.name))

    res.json({
      success: true,
      data: chartData,
    })
  } catch (error) {
    next(error)
  }
})

router.get('/dashboard/sales-chart', async (req, res: Response, next) => {
  try {
    const period = (req.query.period as string) || 'monthly'
    const month = parseInt(req.query.month as string) || (new Date().getMonth() + 1)
    const year = parseInt(req.query.year as string) || new Date().getFullYear()
    
    const targetDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 0, 23, 59, 59, 999)

    const startDate = period === 'monthly'
      ? new Date(targetDate.getFullYear(), targetDate.getMonth() - 11, 1)
      : new Date(targetDate.getTime() - 12 * 7 * 24 * 60 * 60 * 1000)

    const orders = await prisma.order.findMany({
      where: {
        paymentStatus: 'PAID',
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        total: true,
        createdAt: true,
      },
    })

    // Group by month or week
    const grouped: Record<string, number> = {}

    for (const order of orders) {
      const date = new Date(order.createdAt)
      const key = period === 'monthly'
        ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        : `${date.getFullYear()}-W${getWeekNumber(date)}`

      grouped[key] = (grouped[key] || 0) + Number(order.total)
    }

    const chartData = Object.entries(grouped)
      .map(([period, revenue]) => ({ period, revenue: revenue.toFixed(2) }))
      .sort((a, b) => a.period.localeCompare(b.period))

    res.json({
      success: true,
      data: chartData,
    })
  } catch (error) {
    next(error)
  }
})

router.get('/dashboard/category-sales', async (req, res: Response, next) => {
  try {
    const month = parseInt(req.query.month as string) || (new Date().getMonth() + 1)
    const year = parseInt(req.query.year as string) || new Date().getFullYear()

    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 0, 23, 59, 59, 999)

    const orders = await prisma.order.findMany({
      where: { 
        paymentStatus: 'PAID',
        createdAt: { gte: startDate, lte: endDate }
      },
      include: {
        items: {
          include: {
            product: {
              include: { category: true },
            },
          },
        },
      },
    })

    const categoryRevenue: Record<string, number> = {}

    for (const order of orders) {
      for (const item of order.items) {
        const categoryName = item.product.category.name
        categoryRevenue[categoryName] = (categoryRevenue[categoryName] || 0) + Number(item.subtotal)
      }
    }

    const chartData = Object.entries(categoryRevenue)
      .map(([category, revenue]) => ({ category, revenue: revenue.toFixed(2) }))
      .sort((a, b) => Number(b.revenue) - Number(a.revenue))
      .slice(0, 10)

    res.json({
      success: true,
      data: chartData,
    })
  } catch (error) {
    next(error)
  }
})

router.get('/dashboard/hierarchical-sales', async (req, res: Response, next) => {
  try {
    const month = parseInt(req.query.month as string) || (new Date().getMonth() + 1)
    const year = parseInt(req.query.year as string) || new Date().getFullYear()

    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 0, 23, 59, 59, 999)

    const orders = await prisma.order.findMany({
      where: { 
        paymentStatus: 'PAID',
        createdAt: { gte: startDate, lte: endDate }
      },
      include: {
        items: {
          include: {
            product: {
              include: { category: true },
            },
          },
        },
      },
    })

    const hierarchy: Record<string, Record<string, number>> = {}

    for (const order of orders) {
      for (const item of order.items) {
        const categoryName = item.product.category.name
        const productName = item.product.name
        
        if (!hierarchy[categoryName]) {
          hierarchy[categoryName] = {}
        }
        hierarchy[categoryName][productName] = (hierarchy[categoryName][productName] || 0) + item.quantity
      }
    }

    const result = {
      name: "root",
      children: Object.entries(hierarchy).map(([category, products]) => ({
        name: category,
        children: Object.entries(products).map(([product, sales]) => ({
          name: product,
          value: sales
        }))
      }))
    }

    res.json({ success: true, data: result })
  } catch (error) {
    next(error)
  }
})

router.get('/dashboard/top-products', async (req, res: Response, next) => {
  try {
    const month = parseInt(req.query.month as string) || (new Date().getMonth() + 1)
    const year = parseInt(req.query.year as string) || new Date().getFullYear()

    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 0, 23, 59, 59, 999)

    const topProducts = await prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        order: {
          paymentStatus: 'PAID',
          createdAt: { gte: startDate, lte: endDate }
        }
      },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 5,
    })

    const productDetails = await Promise.all(
      topProducts.map(async (item) => {
        const product = await prisma.product.findUnique({
          where: { id: item.productId },
          select: { name: true },
        })
        return {
          name: product?.name || 'Unknown Product',
          sales: item._sum.quantity || 0,
        }
      })
    )

    res.json({ success: true, data: productDetails })
  } catch (error) {
    next(error)
  }
})

// ==================== Products ====================

router.get('/products', async (req, res: Response, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 20
    const search = req.query.search as string
    const category = req.query.category as string
    const status = req.query.status as string
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {}

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { sku: { contains: search } },
      ]
    }

    if (category) {
      where.categoryId = category
    }

    if (status === 'active') {
      where.isActive = true
    } else if (status === 'inactive') {
      where.isActive = false
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        include: {
          category: { select: { id: true, name: true } },
          images: { orderBy: { sortOrder: 'asc' } },
          _count: { select: { orderItems: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.product.count({ where }),
    ])

    res.json({
      success: true,
      data: products.map(p => ({
        ...p,
        price: p.price.toString(),
        mrp: p.mrp.toString(),
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    })
  } catch (error) {
    next(error)
  }
})

router.get('/products/:id', async (req, res: Response, next) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: {
        category: true,
        images: { orderBy: { sortOrder: 'asc' } },
      },
    })

    if (!product) {
      throw createError(404, 'Product not found', 'PRODUCT_NOT_FOUND')
    }

    res.json({
      success: true,
      data: {
        ...product,
        price: product.price.toString(),
        mrp: product.mrp.toString(),
      },
    })
  } catch (error) {
    next(error)
  }
})

router.post('/products', upload.array('images', 5), async (req, res: Response, next) => {
  try {
    const data = JSON.parse(req.body.data || '{}')
    const files = req.files as Express.Multer.File[]
    const uploadedImages = await uploadProductImages(files || [])

    const product = await prisma.product.create({
      data: {
        name: data.name,
        slug: data.slug || slugify(data.name),
        description: data.description,
        price: parseFloat(data.price),
        mrp: parseFloat(data.mrp),
        stock: parseInt(data.stock) || 0,
        sku: data.sku,
        categoryId: data.categoryId,
        weight: data.weight ? parseFloat(data.weight) : null,
        tags: data.tags,
        gstPercent: parseFloat(data.gstPercent) || 18,
        isFeatured: data.isFeatured || false,
        isActive: data.isActive !== false,
        images: {
          create: uploadedImages.map((image, index) => ({
            url: image.url,
            altText: data.name,
            sortOrder: index,
          })),
        },
      },
      include: { images: true },
    })

    res.status(201).json({
      success: true,
      data: {
        ...product,
        price: product.price.toString(),
        mrp: product.mrp.toString(),
      },
    })
  } catch (error) {
    next(error)
  }
})

router.put('/products/:id', upload.array('images', 5), async (req, res: Response, next) => {
  try {
    const { id } = req.params
    const data = JSON.parse(req.body.data || '{}')
    const files = req.files as Express.Multer.File[]
    const uploadedImages = await uploadProductImages(files || [])

    const updateData: Record<string, unknown> = {
      name: data.name,
      slug: data.slug,
      description: data.description,
      price: parseFloat(data.price),
      mrp: parseFloat(data.mrp),
      stock: parseInt(data.stock),
      sku: data.sku,
      categoryId: data.categoryId,
      weight: data.weight ? parseFloat(data.weight) : null,
      tags: data.tags,
      gstPercent: parseFloat(data.gstPercent) || 18,
      isFeatured: data.isFeatured || false,
      isActive: data.isActive !== false,
    }

    const product = await prisma.product.update({
      where: { id },
      data: updateData,
    })

    // Add new images
    if (uploadedImages.length > 0) {
      const existingCount = await prisma.productImage.count({ where: { productId: id } })
      await prisma.productImage.createMany({
        data: uploadedImages.map((image, index) => ({
          productId: id,
          url: image.url,
          altText: data.name,
          sortOrder: existingCount + index,
        })),
      })
    }

    res.json({
      success: true,
      data: {
        ...product,
        price: product.price.toString(),
        mrp: product.mrp.toString(),
      },
    })
  } catch (error) {
    next(error)
  }
})

router.delete('/products/:id', async (req, res: Response, next) => {
  try {
    await prisma.product.update({
      where: { id: req.params.id },
      data: { isActive: false },
    })

    res.json({ success: true, message: 'Product deactivated' })
  } catch (error) {
    next(error)
  }
})

router.patch('/products/:id/toggle', async (req, res: Response, next) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      select: { isActive: true },
    })

    if (!product) {
      throw createError(404, 'Product not found', 'PRODUCT_NOT_FOUND')
    }

    const updated = await prisma.product.update({
      where: { id: req.params.id },
      data: { isActive: !product.isActive },
    })

    res.json({
      success: true,
      data: { isActive: updated.isActive },
    })
  } catch (error) {
    next(error)
  }
})

// ==================== Categories ====================

router.get('/categories', async (_req, res: Response, next) => {
  try {
    const categories = await prisma.category.findMany({
      include: {
        _count: { select: { products: true } },
      },
      orderBy: { name: 'asc' },
    })

    res.json({
      success: true,
      data: categories.map(c => ({
        ...c,
        productCount: c._count.products,
      })),
    })
  } catch (error) {
    next(error)
  }
})

router.post('/categories', async (req, res: Response, next) => {
  try {
    const { name, description, imageUrl } = req.body

    const category = await prisma.category.create({
      data: {
        name,
        slug: slugify(name),
        description,
        imageUrl,
      },
    })

    res.status(201).json({ success: true, data: category })
  } catch (error) {
    next(error)
  }
})

router.put('/categories/:id', async (req, res: Response, next) => {
  try {
    const { name, description, imageUrl, isActive } = req.body

    const category = await prisma.category.update({
      where: { id: req.params.id },
      data: {
        name,
        slug: name ? slugify(name) : undefined,
        description,
        imageUrl,
        isActive,
      },
    })

    res.json({ success: true, data: category })
  } catch (error) {
    next(error)
  }
})

router.delete('/categories/:id', async (req, res: Response, next) => {
  try {
    const productsCount = await prisma.product.count({
      where: { categoryId: req.params.id },
    })

    if (productsCount > 0) {
      throw createError(400, 'Cannot delete category with products', 'CATEGORY_HAS_PRODUCTS')
    }

    await prisma.category.delete({ where: { id: req.params.id } })

    res.json({ success: true, message: 'Category deleted' })
  } catch (error) {
    next(error)
  }
})

// ==================== Orders ====================

router.get('/orders', async (req, res: Response, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 20
    const status = req.query.status as string
    const fromDate = req.query.fromDate as string
    const toDate = req.query.toDate as string
    const search = req.query.search as string
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {}

    if (status) {
      where.status = status
    }

    if (fromDate || toDate) {
      where.createdAt = {}
      if (fromDate) {
        (where.createdAt as Record<string, unknown>).gte = new Date(fromDate)
      }
      if (toDate) {
        (where.createdAt as Record<string, unknown>).lte = new Date(toDate + 'T23:59:59')
      }
    }

    if (search) {
      where.OR = [
        { orderNumber: { contains: search } },
        { user: { name: { contains: search } } },
        { user: { email: { contains: search } } },
      ]
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: { select: { id: true, name: true, email: true, phone: true } },
          items: {
            include: {
              product: {
                select: { id: true, name: true, images: { take: 1 } },
              },
            },
          },
          shipping: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.order.count({ where }),
    ])

    res.json({
      success: true,
      data: orders.map(o => ({
        ...o,
        subtotal: o.subtotal.toString(),
        shippingCharge: o.shippingCharge.toString(),
        discount: o.discount.toString(),
        gstAmount: o.gstAmount.toString(),
        total: o.total.toString(),
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    })
  } catch (error) {
    next(error)
  }
})

router.get('/orders/:id', async (req, res: Response, next) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: {
        user: true,
        address: true,
        items: {
          include: {
            product: {
              include: { images: true },
            },
          },
        },
        shipping: true,
      },
    })

    if (!order) {
      throw createError(404, 'Order not found', 'ORDER_NOT_FOUND')
    }

    res.json({
      success: true,
      data: {
        ...order,
        subtotal: order.subtotal.toString(),
        shippingCharge: order.shippingCharge.toString(),
        discount: order.discount.toString(),
        gstAmount: order.gstAmount.toString(),
        total: order.total.toString(),
      },
    })
  } catch (error) {
    next(error)
  }
})

router.patch('/orders/:id/status', async (req, res: Response, next) => {
  try {
    const { status } = req.body

    const order = await prisma.order.update({
      where: { id: req.params.id },
      data: { status },
      include: {
        user: { select: { name: true, email: true } },
        shipping: true,
      },
    })

    // Send shipping update email when order status changes to SHIPPED or DELIVERED
    if (order.user && order.shipping && ['SHIPPED', 'DELIVERED'].includes(status)) {
      const shipmentStatus = status === 'SHIPPED' ? 'DISPATCHED' : 'DELIVERED'
      if (status === 'DELIVERED') {
        await prisma.shipment.update({
          where: { orderId: order.id },
          data: { status: 'DELIVERED', deliveredAt: new Date() },
        })
      }
      sendShippingUpdateEmail(
        { id: order.id, orderNumber: order.orderNumber, user: order.user },
        {
          status: shipmentStatus,
          courierPartner: order.shipping.courierPartner,
          awbNumber: order.shipping.awbNumber,
          trackingUrl: order.shipping.trackingUrl,
          expectedBy: order.shipping.expectedBy,
        }
      ).catch(err => console.error('Failed to send shipping update email:', err))
    }

    res.json({
      success: true,
      data: { status: order.status },
    })
  } catch (error) {
    next(error)
  }
})

// ==================== Shipments ====================

router.get('/shipments', async (req, res: Response, next) => {
  try {
    const status = req.query.status as string
    const courier = req.query.courier as string

    const where: Record<string, unknown> = {}

    if (status) {
      where.status = status
    }

    if (courier) {
      where.courierPartner = courier
    }

    const shipments = await prisma.shipment.findMany({
      where,
      include: {
        order: {
          include: {
            user: { select: { id: true, name: true, email: true, phone: true } },
            items: {
              include: {
                product: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    })

    res.json({
      success: true,
      data: shipments.map(s => ({
        ...s,
        trackingUrl: s.awbNumber ? getTrackingUrl(s.courierPartner, s.awbNumber) : null,
      })),
    })
  } catch (error) {
    next(error)
  }
})

router.post('/shipments', async (req, res: Response, next) => {
  try {
    const { orderId, courierPartner } = req.body
    const config = getStoreConfig()

    const shipment = await prisma.shipment.create({
      data: {
        orderId,
        courierPartner: courierPartner || config.courier.defaultPartner,
      },
    })

    res.status(201).json({ success: true, data: shipment })
  } catch (error) {
    next(error)
  }
})

router.put('/shipments/:id', async (req, res: Response, next) => {
  try {
    const { courierPartner, awbNumber, status, notes } = req.body

    const oldShipment = await prisma.shipment.findUnique({
      where: { id: req.params.id },
    })

    const shipment = await prisma.shipment.update({
      where: { id: req.params.id },
      data: {
        courierPartner,
        awbNumber,
        status,
        notes,
        trackingUrl: awbNumber ? getTrackingUrl(courierPartner, awbNumber) : undefined,
        ...(status === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
      },
      include: {
        order: {
          include: {
            user: { select: { name: true, email: true } },
          },
        },
      },
    })

    // Update order status if shipment delivered
    if (status === 'DELIVERED') {
      await prisma.order.update({
        where: { id: shipment.orderId },
        data: { status: 'DELIVERED' },
      })
    }

    // Send email if status changed
    if (status && oldShipment && status !== oldShipment.status && shipment.order.user) {
      sendShippingUpdateEmail(
        { id: shipment.order.id, orderNumber: shipment.order.orderNumber, user: shipment.order.user },
        {
          status,
          courierPartner: shipment.courierPartner,
          awbNumber: shipment.awbNumber,
          trackingUrl: shipment.trackingUrl,
          expectedBy: shipment.expectedBy,
        }
      ).catch(err => console.error('Failed to send shipping update email:', err))
    }

    res.json({ success: true, data: shipment })
  } catch (error) {
    next(error)
  }
})

router.post('/shipments/:id/mark-dispatched', async (req, res: Response, next) => {
  try {
    const { awbNumber, courierPartner } = req.body

    const shipment = await prisma.shipment.update({
      where: { id: req.params.id },
      data: {
        status: 'DISPATCHED',
        awbNumber,
        courierPartner,
        dispatchedAt: new Date(),
        trackingUrl: getTrackingUrl(courierPartner, awbNumber),
      },
    })

    // Update order status
    const order = await prisma.order.update({
      where: { id: shipment.orderId },
      data: { status: 'SHIPPED' },
      include: {
        user: { select: { name: true, email: true } },
      },
    })

    // Send dispatch notification email
    if (order.user) {
      sendShippingUpdateEmail(
        { id: order.id, orderNumber: order.orderNumber, user: order.user },
        {
          status: 'DISPATCHED',
          courierPartner,
          awbNumber,
          trackingUrl: getTrackingUrl(courierPartner, awbNumber),
        }
      ).catch(err => console.error('Failed to send dispatch email:', err))
    }

    res.json({ success: true, data: shipment })
  } catch (error) {
    next(error)
  }
})

// ==================== Users ====================

router.get('/users', async (req, res: Response, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 20
    const search = req.query.search as string
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = { role: 'CUSTOMER' }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
      ]
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          createdAt: true,
          _count: { select: { orders: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ])

    res.json({
      success: true,
      data: users.map(u => ({
        ...u,
        orderCount: u._count.orders,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    })
  } catch (error) {
    next(error)
  }
})

router.get('/users/:id', async (req, res: Response, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
        addresses: true,
        orders: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            items: {
              include: {
                product: { select: { id: true, name: true, images: { take: 1 } } },
              },
            },
          },
        },
        _count: { select: { orders: true } },
      },
    })

    if (!user) {
      throw createError(404, 'User not found', 'USER_NOT_FOUND')
    }

    res.json({
      success: true,
      data: {
        ...user,
        orders: user.orders.map(o => ({
          ...o,
          total: o.total.toString(),
        })),
      },
    })
  } catch (error) {
    next(error)
  }
})

// ==================== Coupons ====================

router.get('/coupons', async (_req, res: Response, next) => {
  try {
    const coupons = await prisma.coupon.findMany()

    res.json({
      success: true,
      data: coupons.map(c => ({
        ...c,
        discountValue: c.discountValue.toString(),
        minOrderValue: c.minOrderValue?.toString() || null,
      })),
    })
  } catch (error) {
    next(error)
  }
})

router.post('/coupons', async (req, res: Response, next) => {
  try {
    const { code, discountType, discountValue, minOrderValue, maxUsage, expiresAt } = req.body

    const coupon = await prisma.coupon.create({
      data: {
        code: code.toUpperCase(),
        discountType,
        discountValue: parseFloat(discountValue),
        minOrderValue: minOrderValue ? parseFloat(minOrderValue) : null,
        maxUsage,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    })

    res.status(201).json({
      success: true,
      data: {
        ...coupon,
        discountValue: coupon.discountValue.toString(),
        minOrderValue: coupon.minOrderValue?.toString() || null,
      },
    })
  } catch (error) {
    next(error)
  }
})

router.put('/coupons/:id', async (req, res: Response, next) => {
  try {
    const { code, discountType, discountValue, minOrderValue, maxUsage, expiresAt, isActive } = req.body

    const coupon = await prisma.coupon.update({
      where: { id: req.params.id },
      data: {
        code: code?.toUpperCase(),
        discountType,
        discountValue: discountValue ? parseFloat(discountValue) : undefined,
        minOrderValue: minOrderValue ? parseFloat(minOrderValue) : null,
        maxUsage,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        isActive,
      },
    })

    res.json({
      success: true,
      data: {
        ...coupon,
        discountValue: coupon.discountValue.toString(),
        minOrderValue: coupon.minOrderValue?.toString() || null,
      },
    })
  } catch (error) {
    next(error)
  }
})

router.delete('/coupons/:id', async (req, res: Response, next) => {
  try {
    await prisma.coupon.delete({ where: { id: req.params.id } })

    res.json({ success: true, message: 'Coupon deleted' })
  } catch (error) {
    next(error)
  }
})

// ==================== Storage Diagnostics ====================

router.get('/storage/status', async (_req, res: Response) => {
  const provider = getActiveProvider()
  res.json({
    success: true,
    data: {
      activeProvider: provider,
      providers: {
        r2: { enabled: isR2Enabled, label: 'Cloudflare R2' },
        cloudinary: { enabled: isCloudinaryEnabled, label: 'Cloudinary' },
        local: { enabled: true, label: 'Local Disk (always available)' },
      },
    },
  })
})

// Helper functions
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function getWeekNumber(date: Date): string {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1)
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000
  return String(Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7)).padStart(2, '0')
}

export default router
