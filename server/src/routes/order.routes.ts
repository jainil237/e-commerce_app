import { Router, Response } from 'express'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import Razorpay from 'razorpay'
import crypto from 'crypto'
import { prisma } from '../utils/prisma'
import { authenticate, AuthRequest } from '../middleware/auth.middleware'
import { getStoreConfig } from '../utils/config'
import { createError } from '../middleware/error.middleware'
import { generateInvoicePdf } from '../services/invoice.service'
import { sendOrderConfirmationEmail, sendOrderCancelledEmail, sendInvoiceEmail } from '../services/email.service'

const router = Router()

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
})

const createOrderSchema = z.object({
  items: z.array(
    z.object({
      productId: z.string().uuid(),
      quantity: z.number().int().positive(),
    })
  ).min(1),
  addressId: z.string().uuid(),
  couponCode: z.string().optional(),
  notes: z.string().optional(),
  sessionId: z.string().optional(),
})

// Create order and Razorpay order
router.post('/', authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const validatedData = createOrderSchema.parse(req.body)
    const config = getStoreConfig()

    // Verify address belongs to user
    const address = await prisma.address.findFirst({
      where: {
        id: validatedData.addressId,
        userId: req.user!.id,
      },
    })

    if (!address) {
      throw createError(400, 'Invalid address', 'INVALID_ADDRESS')
    }

    // Get products and validate stock
    const productIds = validatedData.items.map(item => item.productId)
    const products = await prisma.product.findMany({
      where: {
        id: { in: productIds },
        isActive: true,
      },
      include: {
        category: true,
      },
    })

    if (products.length !== productIds.length) {
      throw createError(400, 'Some products are unavailable', 'PRODUCTS_UNAVAILABLE')
    }

    // Validate stock and deduct atomically with row-level locks
    const sortedProductIds = [...productIds].sort()
    await prisma.$transaction(async (tx) => {
      // Lock all products in consistent order to prevent deadlocks
      for (const id of sortedProductIds) {
        await tx.$executeRaw`SELECT id FROM Product WHERE id = ${id} FOR UPDATE`
      }

      for (const item of validatedData.items) {
        const product = products.find(p => p.id === item.productId)!

        if (product.stock < item.quantity) {
          throw createError(400, `Insufficient stock for ${product.name}`, 'INSUFFICIENT_STOCK')
        }

        // Deduct stock
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        })
      }
    })

    // Calculate totals
    let subtotal = 0
    const totalGst = 0 // GST is now inclusive
    const orderItems: Array<{
      productId: string
      quantity: number
      unitPrice: number
      gstPercent: number
      subtotal: number
    }> = []

    for (const item of validatedData.items) {
      const product = products.find(p => p.id === item.productId)!
      const itemSubtotal = Number(product.price) * item.quantity
      
      subtotal += itemSubtotal
      
      orderItems.push({
        productId: product.id,
        quantity: item.quantity,
        unitPrice: Number(product.price),
        gstPercent: product.gstPercent,
        subtotal: itemSubtotal,
      })
    }

    // Calculate shipping
    let shippingCharge = config.shipping.baseShippingCharge
    if (subtotal >= config.shipping.freeShippingAbove) {
      shippingCharge = 0
    }

    // Apply coupon if provided
    let discount = 0
    if (validatedData.couponCode) {
      const coupon = await prisma.coupon.findUnique({
        where: { code: validatedData.couponCode.toUpperCase() },
      })

      if (!coupon || !coupon.isActive) {
        throw createError(400, 'Invalid coupon code', 'INVALID_COUPON')
      }

      // Check validFrom
      if (coupon.validFrom && coupon.validFrom > new Date()) {
        throw createError(400, 'Coupon is not yet valid', 'COUPON_NOT_YET_VALID')
      }

      // Check expiry
      if (coupon.expiresAt && coupon.expiresAt < new Date()) {
        throw createError(400, 'Coupon has expired', 'COUPON_EXPIRED')
      }

      // Check global usage limit
      if (coupon.maxUsage && coupon.usedCount >= coupon.maxUsage) {
        throw createError(400, 'Coupon usage limit reached', 'COUPON_LIMIT_REACHED')
      }

      // Check per-user usage limit
      const usage = await prisma.couponUsage.findUnique({
        where: {
          couponId_userId: {
            couponId: coupon.id,
            userId: req.user!.id,
          },
        },
      })

      if (usage && coupon.perUserLimit && usage.usedCount >= coupon.perUserLimit) {
        throw createError(400, 'You have reached the usage limit for this coupon', 'USER_COUPON_LIMIT_REACHED')
      }

      // Check minimum order value
      if (coupon.minOrderValue && subtotal < Number(coupon.minOrderValue)) {
        throw createError(
          400,
          `Minimum order value ₹${coupon.minOrderValue} required`,
          'COUPON_MIN_ORDER'
        )
      }

      if (coupon.discountType === 'PERCENTAGE') {
        discount = subtotal * (Number(coupon.discountValue) / 100)
      } else {
        discount = Number(coupon.discountValue)
      }
    }

    const total = subtotal + shippingCharge - discount

    // Generate order number
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`

    // Create Razorpay order (or mock if using placeholder keys)
    let razorpayOrder;
    if (process.env.RAZORPAY_KEY_ID === 'rzp_test_placeholder' || process.env.RAZORPAY_KEY_ID?.startsWith('rzp_test_placeholder')) {
      razorpayOrder = {
        id: `order_mock_${Date.now()}`,
        amount: Math.round(total * 100),
        currency: config.store.currency,
      }
    } else {
      razorpayOrder = await razorpay.orders.create({
        amount: Math.round(total * 100), // in paise
        currency: config.store.currency,
        receipt: orderNumber,
        notes: {
          userId: req.user!.id,
        },
      })
    }

    // Create order in database
    const order = await prisma.order.create({
      data: {
        orderNumber,
        userId: req.user!.id,
        addressId: address.id,
        subtotal,
        shippingCharge,
        discount,
        gstAmount: totalGst,
        total,
        status: 'PENDING',
        paymentStatus: 'PENDING',
        razorpayOrderId: razorpayOrder.id,
        couponCode: validatedData.couponCode,
        notes: validatedData.notes,
        items: {
          create: orderItems,
        },
      },
      include: {
        items: {
          include: {
            product: {
              include: { images: true },
            },
          },
        },
        address: true,
      },
    })

    res.status(201).json({
      success: true,
      data: {
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          total: order.total.toString(),
        },
        razorpay: {
          orderId: razorpayOrder.id,
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency,
          key: process.env.RAZORPAY_KEY_ID,
        },
      },
    })
  } catch (error) {
    next(error)
  }
})

// Verify payment
router.post('/verify-payment', authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body

    if (!orderId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      throw createError(400, 'Missing payment details', 'MISSING_PAYMENT_DETAILS')
    }

    // In mock/dev mode, skip signature verification
    const isMockMode = !process.env.RAZORPAY_KEY_ID ||
      process.env.RAZORPAY_KEY_ID === 'rzp_test_placeholder' ||
      process.env.RAZORPAY_KEY_ID.startsWith('rzp_test_placeholder')

    if (!isMockMode) {
      // Verify Razorpay HMAC signature
      const body = razorpayOrderId + '|' + razorpayPaymentId
      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
        .update(body)
        .digest('hex')

      if (expectedSignature !== razorpaySignature) {
        throw createError(400, 'Invalid payment signature', 'INVALID_SIGNATURE')
      }
    }

    // Get order
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        userId: req.user!.id,
      },
      include: {
        items: {
          include: { product: true },
        },
        address: true,
      },
    })

    if (!order) {
      throw createError(404, 'Order not found', 'ORDER_NOT_FOUND')
    }

    // Update order
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: 'PAID',
        status: 'CONFIRMED',
        razorpayPaymentId,
      },
      include: {
        items: {
          include: {
            product: {
              include: { images: true },
            },
          },
        },
        address: true,
        user: true,
      },
    })

    // NOTE: Stock was already deducted during order creation.
    // Do NOT deduct again here to prevent double-reduction.

    // Increment coupon usage
    if (order.couponCode) {
      const coupon = await prisma.coupon.findUnique({
        where: { code: order.couponCode.toUpperCase() },
      })

      if (coupon) {
        // Global increment
        await prisma.coupon.update({
          where: { id: coupon.id },
          data: { usedCount: { increment: 1 } },
        })

        // Per-user increment
        await prisma.couponUsage.upsert({
          where: {
            couponId_userId: {
              couponId: coupon.id,
              userId: req.user!.id,
            },
          },
          create: {
            couponId: coupon.id,
            userId: req.user!.id,
            usedCount: 1,
          },
          update: {
            usedCount: { increment: 1 },
          },
        })
      }
    }

    if (!updatedOrder.user) {
      throw createError(500, 'User details missing', 'MISSING_USER')
    }

    const orderWithUser = {
      ...updatedOrder,
      user: updatedOrder.user
    }

    // Generate invoice
    const invoicePath = await generateInvoicePdf(orderWithUser)

    // Update invoice URL
    await prisma.order.update({
      where: { id: orderId },
      data: { invoiceUrl: invoicePath },
    })

    // Send confirmation email (non-blocking — don't fail the payment if email fails)
    sendOrderConfirmationEmail(orderWithUser, invoicePath)
      .catch(err => console.error('[Email] Failed to send order confirmation:', err))

    res.json({
      success: true,
      data: {
        orderId: updatedOrder.id,
        orderNumber: updatedOrder.orderNumber,
        status: updatedOrder.status,
        paymentStatus: updatedOrder.paymentStatus,
      },
    })
  } catch (error) {
    next(error)
  }
})

// Get user's orders
router.get('/', authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 10
    const skip = (page - 1) * limit

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: { userId: req.user!.id },
        skip,
        take: limit,
        include: {
          items: {
            include: {
              product: {
                include: { images: { take: 1 } },
              },
            },
          },
          shipping: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.order.count({ where: { userId: req.user!.id } }),
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
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    next(error)
  }
})

// Get order by ID
router.get('/:id', authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { id } = req.params

    const order = await prisma.order.findFirst({
      where: {
        id,
        userId: req.user!.id,
      },
      include: {
        items: {
          include: {
            product: {
              include: { images: true, category: true },
            },
          },
        },
        address: true,
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

// Download invoice
router.get('/:id/invoice', authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { id } = req.params

    const order = await prisma.order.findFirst({
      where: {
        id,
        userId: req.user!.id,
      },
      include: {
        items: { include: { product: true } },
        address: true,
        user: true,
      },
    })

    if (!order) {
      throw createError(404, 'Order not found', 'ORDER_NOT_FOUND')
    }

    if (order.paymentStatus !== 'PAID') {
      throw createError(404, 'Invoice not available', 'INVOICE_NOT_FOUND')
    }

    if (!order.user) {
      throw createError(500, 'User details missing', 'MISSING_USER')
    }

    let invoiceUrl = order.invoiceUrl
    if (!invoiceUrl) {
      invoiceUrl = await generateInvoicePdf(order as typeof order & { user: NonNullable<typeof order.user> })
      await prisma.order.update({
        where: { id },
        data: { invoiceUrl },
      })
    }

    if (invoiceUrl.startsWith('http')) {
      return res.redirect(invoiceUrl)
    }

    res.download(invoiceUrl, `invoice-${order.orderNumber}.pdf`)
  } catch (error) {
    next(error)
  }
})

// Send invoice over email
router.post('/:id/invoice/email', authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { id } = req.params

    const order = await prisma.order.findFirst({
      where: {
        id,
        userId: req.user!.id,
      },
      include: {
        items: { include: { product: true } },
        address: true,
        user: true,
      },
    })

    if (!order) {
      throw createError(404, 'Order not found', 'ORDER_NOT_FOUND')
    }

    if (order.paymentStatus !== 'PAID') {
      throw createError(404, 'Invoice not available', 'INVOICE_NOT_FOUND')
    }

    if (!order.user) {
      throw createError(500, 'User details missing', 'MISSING_USER')
    }

    let invoiceUrl = order.invoiceUrl
    if (!invoiceUrl) {
      invoiceUrl = await generateInvoicePdf(order as typeof order & { user: NonNullable<typeof order.user> })
      await prisma.order.update({
        where: { id },
        data: { invoiceUrl },
      })
    }

    await sendInvoiceEmail(order as typeof order & { user: NonNullable<typeof order.user> }, invoiceUrl)

    res.json({
      success: true,
      message: `Invoice sent to ${order.user.email}`,
    })
  } catch (error) {
    next(error)
  }
})

// Cancel order
router.post('/:id/cancel', authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { id } = req.params

    const order = await prisma.order.findFirst({
      where: {
        id,
        userId: req.user!.id,
      },
      include: {
        items: true,
        user: { select: { name: true, email: true } },
      },
    })

    if (!order) {
      throw createError(404, 'Order not found', 'ORDER_NOT_FOUND')
    }

    if (!['PENDING', 'CONFIRMED', 'PROCESSING'].includes(order.status)) {
      throw createError(400, 'Order cannot be cancelled', 'CANNOT_CANCEL')
    }


    // Update order status
    await prisma.order.update({
      where: { id },
      data: { status: 'CANCELLED' },
    })

    // Restore stock
    for (const item of order.items) {
      await prisma.product.update({
        where: { id: item.productId },
        data: { stock: { increment: item.quantity } },
      })
    }

    // Send cancellation email
    if (order.user) {
      sendOrderCancelledEmail(order as typeof order & { user: { name: string; email: string } })
        .catch(err => console.error('Failed to send cancellation email:', err))
    }

    res.json({
      success: true,
      message: 'Order cancelled successfully',
    })
  } catch (error) {
    next(error)
  }
})

export default router
