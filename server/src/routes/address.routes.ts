import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../utils/prisma'
import { authenticate, AuthRequest } from '../middleware/auth.middleware'
import { createError } from '../middleware/error.middleware'

const router = Router()

const addressSchema = z.object({
  label: z.string().default('Home'),
  line1: z.string().min(5, 'Address line 1 is required'),
  line2: z.string().optional(),
  city: z.string().min(2, 'City is required'),
  state: z.string().min(2, 'State is required'),
  pincode: z.string().regex(/^[1-9][0-9]{5}$/, 'Invalid pincode'),
  isDefault: z.boolean().optional(),
})

// Get all addresses
router.get('/', authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const addresses = await prisma.address.findMany({
      where: { userId: req.user!.id },
      orderBy: { isDefault: 'desc' },
    })

    res.json({
      success: true,
      data: addresses,
    })
  } catch (error) {
    next(error)
  }
})

// Create address
router.post('/', authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const validatedData = addressSchema.parse(req.body)

    // If setting as default, unset other defaults
    if (validatedData.isDefault) {
      await prisma.address.updateMany({
        where: { userId: req.user!.id, isDefault: true },
        data: { isDefault: false },
      })
    }

    const address = await prisma.address.create({
      data: {
        userId: req.user!.id,
        label: validatedData.label,
        line1: validatedData.line1,
        line2: validatedData.line2,
        city: validatedData.city,
        state: validatedData.state,
        pincode: validatedData.pincode,
        isDefault: validatedData.isDefault ?? false,
      },
    })

    res.status(201).json({
      success: true,
      data: address,
    })
  } catch (error) {
    next(error)
  }
})

// Update address
router.put('/:id', authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { id } = req.params
    const validatedData = addressSchema.partial().parse(req.body)

    // Verify ownership
    const existingAddress = await prisma.address.findFirst({
      where: { id, userId: req.user!.id },
    })

    if (!existingAddress) {
      throw createError(404, 'Address not found', 'ADDRESS_NOT_FOUND')
    }

    // If setting as default, unset other defaults
    if (validatedData.isDefault) {
      await prisma.address.updateMany({
        where: { userId: req.user!.id, isDefault: true },
        data: { isDefault: false },
      })
    }

    const address = await prisma.address.update({
      where: { id },
      data: validatedData,
    })

    res.json({
      success: true,
      data: address,
    })
  } catch (error) {
    next(error)
  }
})

// Delete address
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { id } = req.params

    // Verify ownership
    const address = await prisma.address.findFirst({
      where: { id, userId: req.user!.id },
    })

    if (!address) {
      throw createError(404, 'Address not found', 'ADDRESS_NOT_FOUND')
    }

    await prisma.address.delete({ where: { id } })

    res.json({
      success: true,
      message: 'Address deleted successfully',
    })
  } catch (error) {
    next(error)
  }
})

export default router
