import { Response } from 'express'
import { AuthRequest } from '../middleware/auth.middleware'
import { RmaService } from '../services/rma.service'
import {
  AdminApproveRmaSchema,
  AdminRejectRmaSchema,
  AdminSchedulePickupSchema,
  AdminMarkReceivedSchema,
  AdminShipReplacementSchema,
} from '../validators/rma.validator'
import { PrismaClient } from '@prisma/client'
import { sendRmaApprovedCustomerNotificationEmail } from '../services/email.service'

const prisma = new PrismaClient()

export const getAllRmaRequests = async (req: AuthRequest, res: Response) => {
  try {
    const { status, type } = req.query
    const where: any = {}
    if (status) where.status = status
    if (type) where.type = type

    const requests = await prisma.rMARequest.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        order: { select: { orderNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return res.json({ success: true, data: requests })
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Server error' })
  }
}

export const approveRma = async (req: AuthRequest, res: Response) => {
  try {
    const adminId = req.user!.id
    const { params, body } = AdminApproveRmaSchema.parse(req)
    const updated = await RmaService.approveRmaRequest(params.id, adminId, body.adminNote)

    // Trigger customer notification email asynchronously
    sendRmaApprovedCustomerNotificationEmail(updated.id).catch((err) => {
      console.error('[Email Error] Failed to send RMA approved customer notification:', err)
    })

    return res.json({ success: true, data: updated })
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message })
  }
}

export const rejectRma = async (req: AuthRequest, res: Response) => {
  try {
    const adminId = req.user!.id
    const { params, body } = AdminRejectRmaSchema.parse(req)
    const updated = await RmaService.rejectRmaRequest(params.id, adminId, body.reason)
    return res.json({ success: true, data: updated })
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message })
  }
}

export const schedulePickup = async (req: AuthRequest, res: Response) => {
  try {
    const adminId = req.user!.id
    const { params, body } = AdminSchedulePickupSchema.parse(req)
    const updated = await RmaService.schedulePickup(params.id, adminId, body.courierPartner, body.awbNumber)
    return res.json({ success: true, data: updated })
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message })
  }
}

export const markReceived = async (req: AuthRequest, res: Response) => {
  try {
    const adminId = req.user!.id
    const { params, body } = AdminMarkReceivedSchema.parse(req)
    const updated = await RmaService.markReceived(params.id, adminId, body.restockItems)
    return res.json({ success: true, data: updated })
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message })
  }
}

export const issueRefund = async (req: AuthRequest, res: Response) => {
  try {
    const adminId = req.user!.id
    const { id } = req.params
    const updated = await RmaService.issueRefund(id, adminId)
    return res.json({ success: true, data: updated })
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message })
  }
}

export const shipReplacement = async (req: AuthRequest, res: Response) => {
  try {
    const adminId = req.user!.id
    const { params, body } = AdminShipReplacementSchema.parse(req)
    const updated = await RmaService.shipReplacement(params.id, adminId, body.courierPartner, body.awbNumber)
    return res.json({ success: true, data: updated })
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message })
  }
}
