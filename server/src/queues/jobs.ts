/**
 * Job names and payload types.
 *
 * Payloads carry IDs, never whole entities: a job may run minutes after it was
 * enqueued (longer if the Render instance was idle), so the handler must read
 * current state rather than act on a stale snapshot.
 */

export const JOB = {
  ORDER_CONFIRMATION: 'order-confirmation',
  SHIPPING_UPDATE: 'shipping-update',
  OTP_EMAIL: 'otp-email',
  SWEEP_RESERVATIONS: 'sweep-reservations',
} as const

export type JobName = (typeof JOB)[keyof typeof JOB]

export interface OrderConfirmationPayload {
  orderId: string
}

/**
 * The shipping details are a snapshot of the status transition that triggered
 * this job, not current state — re-deriving them at run time could report a
 * later status than the one the customer is being emailed about. Only the
 * order/user is re-read.
 */
export interface ShippingUpdatePayload {
  orderId: string
  shipping: {
    status: string
    courierPartner: string
    awbNumber?: string | null
    trackingUrl?: string | null
    expectedBy?: string | null
  }
}

export interface OtpEmailPayload {
  email: string
  otp: string
  purpose: 'password-reset' | 'email-verification'
}

export interface SweepReservationsPayload {
  // Empty — the sweeper derives its own cutoff from the current time.
  [key: string]: never
}
