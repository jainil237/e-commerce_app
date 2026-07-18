import { Router } from 'express'
import {
  getAllRmaRequests,
  approveRma,
  rejectRma,
  schedulePickup,
  markReceived,
  issueRefund,
  shipReplacement,
} from '../controllers/admin.rma.controller'

const router = Router()

router.get('/', getAllRmaRequests)
router.patch('/:id/approve', approveRma)
router.patch('/:id/reject', rejectRma)
router.post('/:id/schedule-pickup', schedulePickup)
router.post('/:id/mark-received', markReceived)
router.post('/:id/issue-refund', issueRefund)
router.post('/:id/ship-replacement', shipReplacement)

export default router
