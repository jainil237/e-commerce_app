import { Router } from 'express'
import {
  createRmaRequest,
  getMyRmaRequests,
  getRmaRequestById,
  cancelRmaRequest,
} from '../controllers/rma.controller'
import { authenticate } from '../middleware/auth.middleware'

const router = Router()

router.use(authenticate)

router.post('/request', createRmaRequest)
router.get('/', getMyRmaRequests)
router.get('/:id', getRmaRequestById)
router.post('/:id/cancel', cancelRmaRequest)

export default router
