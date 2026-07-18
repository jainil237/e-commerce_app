import { z } from 'zod'

export const CreateRmaSchema = z.object({
  body: z.object({
    orderId: z.string().uuid('Invalid order ID'),
    type: z.enum(['RETURN', 'REPLACEMENT']),
    reason: z.enum([
      'DAMAGED',
      'WRONG_ITEM',
      'SIZE_ISSUE',
      'QUALITY_ISSUE',
      'NOT_AS_DESCRIBED',
      'OTHER',
    ]),
    items: z
      .array(
        z.object({
          orderItemId: z.string().uuid(),
          quantity: z.number().int().positive(),
        })
      )
      .min(1, 'At least one item must be selected'),
    images: z.array(z.string().url()).max(5, 'Maximum 5 images allowed'),
    customerNote: z.string().max(500).optional(),
    refundDetails: z
      .object({
        mode: z.enum(['ORIGINAL_PAYMENT_METHOD', 'BANK_ACCOUNT', 'UPI']),
        bankDetails: z.string().optional(), // Encrypted JSON on the backend
      })
      .optional(),
  }),
})

export const AdminApproveRmaSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    adminNote: z.string().optional(),
  }),
})

export const AdminRejectRmaSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    reason: z.string().min(5, 'Reason is required for rejection'),
  }),
})

export const AdminSchedulePickupSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    courierPartner: z.string().min(2),
    awbNumber: z.string().min(5),
  }),
})

export const AdminShipReplacementSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    courierPartner: z.string().min(2),
    awbNumber: z.string().min(5),
  }),
})

export const AdminMarkReceivedSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    restockItems: z.boolean().default(false),
  }),
})
