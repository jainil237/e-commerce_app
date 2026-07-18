import { Response } from 'express'
import { AuthRequest } from '../middleware/auth.middleware'
import { RmaService } from '../services/rma.service'
import { CreateRmaSchema } from '../validators/rma.validator'
import { PrismaClient } from '@prisma/client'
import { sendRmaCreatedAdminNotificationEmail } from '../services/email.service'

const prisma = new PrismaClient()

export const createRmaRequest = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id
    const validatedData = CreateRmaSchema.parse(req)
    
    const rma = await RmaService.createRmaRequest({
      ...validatedData.body,
      userId,
    })

    // Trigger admin/seller notification email asynchronously
    sendRmaCreatedAdminNotificationEmail(rma.id).catch((err) => {
      console.error('[Email Error] Failed to send RMA created admin notification:', err)
    })

    return res.status(201).json({
      success: true,
      data: rma,
    })
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to create RMA request',
      code: 'RMA_CREATION_FAILED',
    })
  }
}

export const getMyRmaRequests = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id
    const requests = await prisma.rMARequest.findMany({
      where: { userId },
      include: {
        items: { include: { orderItem: { include: { product: true } } } },
        refund: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return res.json({
      success: true,
      data: requests,
    })
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch RMA requests',
    })
  }
}

export const getRmaRequestById = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id
    const { id } = req.params

    const rma = await prisma.rMARequest.findFirst({
      where: { id, userId },
      include: {
        items: { include: { orderItem: { include: { product: true } } } },
        images: true,
        refund: true,
        pickupShipment: true,
        replacementShipment: true,
      },
    })

    if (!rma) {
      return res.status(404).json({ success: false, message: 'RMA request not found' })
    }

    return res.json({
      success: true,
      data: rma,
    })
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Server error' })
  }
}

export const cancelRmaRequest = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id
    const { id } = req.params

    const rma = await prisma.rMARequest.findFirst({
      where: { id, userId },
    })

    if (!rma) {
      return res.status(404).json({ success: false, message: 'RMA request not found' })
    }

    if (rma.status !== 'PENDING') {
      return res.status(400).json({ success: false, message: 'Only PENDING requests can be cancelled' })
    }

    const updated = await prisma.rMARequest.update({
      where: { id },
      data: { status: 'CANCELLED' },
    })

    return res.json({ success: true, data: updated })
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Server error' })
  }
}
