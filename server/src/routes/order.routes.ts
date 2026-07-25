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
import { isPaymentsMockMode } from '../config/payments'
import { confirmPayment, PaymentConfirmationError } from '../services/payment-confirmation.service'

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

    // Validate stock and deduct atomically: the WHERE and the decrement are one statement, so
    // MySQL evaluates `stock >= quantity` under the row lock it takes itself — no window between
    // reading stock and writing it, unlike a separate read-then-decrement. Items are processed in
    // productId order to avoid deadlocking against other concurrent orders taking the same locks.
    const sortedItems = [...validatedData.items].sort((a, b) => a.productId.localeCompare(b.productId))
    await prisma.$transaction(async (tx) => {
      for (const item of sortedItems) {
        const product = products.find(p => p.id === item.productId)!

        const result = await tx.product.updateMany({
          where: { id: item.productId, stock: { gte: item.quantity } },
          data: { stock: { decrement: item.quantity } },
        })

        if (result.count === 0) {
          throw createError(400, `Insufficient stock for ${product.name}`, 'INSUFFICIENT_STOCK')
        }
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

      // R4 — a FLAT coupon larger than the order (or a misconfigured
      // PERCENTAGE above 100) must never push the total below zero.
      discount = Math.min(discount, subtotal + shippingCharge)
    }

    const total = subtotal + shippingCharge - discount

    // Generate order number
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`

    // Create Razorpay order (or mock in PAYMENTS_MOCK mode)
    let razorpayOrder;
    if (isPaymentsMockMode()) {
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

    // In PAYMENTS_MOCK mode, skip signature verification
    if (!isPaymentsMockMode()) {
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

    // NOTE: Stock was already deducted during order creation.
    // Do NOT deduct again here to prevent double-reduction.

    let result
    try {
      result = await confirmPayment({
        orderId,
        razorpayOrderId,
        razorpayPaymentId,
        source: 'client',
        actorUserId: req.user!.id,
      })
    } catch (err) {
      if (err instanceof PaymentConfirmationError) {
        throw createError(err.statusCode, err.message, err.code)
      }
      throw err
    }

    const updatedOrder = result.order

    // Invoice + confirmation email only on first confirmation — a replayed
    // or duplicate request is a no-op, not a resend.
    if (!result.alreadyConfirmed) {
      if (!updatedOrder.user) {
        throw createError(500, 'User details missing', 'MISSING_USER')
      }

      const orderWithUser = {
        ...updatedOrder,
        user: updatedOrder.user,
      }

      const invoicePath = await generateInvoicePdf(orderWithUser)

      await prisma.order.update({
        where: { id: orderId },
        data: { invoiceUrl: invoicePath },
      })

      // Send confirmation email (non-blocking — don't fail the payment if email fails)
      sendOrderConfirmationEmail(orderWithUser, invoicePath)
        .catch(err => console.error('[Email] Failed to send order confirmation:', err))
    }

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

// Get courier config (public, no auth required) - must come before /:id route
router.get('/courier-config', async (req, res: Response, next) => {
  try {
    const config = getStoreConfig()
    res.json({
      success: true,
      data: {
        partners: config.courier.partners,
        trackingUrls: config.courier.trackingUrls,
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
        rmaRequests: {
          include: {
            items: true,
            refund: true,
            pickupShipment: true,
            replacementShipment: true,
          }
        }
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
        tracking: order.shipping && order.shipping.awbNumber ? {
          courier: order.shipping.courierPartner,
          trackingId: order.shipping.awbNumber,
          trackingUrl: order.shipping.trackingUrl || '',
        } : undefined,
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
      try {
        const response = await fetch(invoiceUrl)
        if (!response.ok) {
          throw new Error(`Failed to fetch invoice from storage: ${response.statusText}`)
        }
        const arrayBuffer = await response.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', `attachment; filename="invoice-${order.orderNumber}.pdf"`)
        return res.send(buffer)
      } catch (err) {
        console.error('Failed to proxy invoice download, redirecting instead:', err)
        return res.redirect(invoiceUrl)
      }
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
