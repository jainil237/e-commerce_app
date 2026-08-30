import nodemailer from 'nodemailer'
import fs from 'fs'
import path from 'path'
import { Resend } from 'resend'
import { PrismaClient } from '@prisma/client'
import { getStoreConfig } from '../utils/config'
import { getTrackingUrl } from '../utils/tracking'

const prisma = new PrismaClient()

interface OrderUser {
  name: string
  email: string
  phone: string
}

interface OrderAddress {
  label: string
  line1: string
  line2: string | null
  city: string
  state: string
  pincode: string
}

interface OrderItem {
  quantity: number
  unitPrice: { toNumber: () => number }
  product: {
    name: string
  }
}

interface OrderWithRelations {
  id: string
  orderNumber: string
  total: { toNumber: () => number }
  createdAt: Date
  user: OrderUser
  address: OrderAddress
  items: OrderItem[]
}

// Check if SMTP is fully configured with real credentials
function isSmtpConfigured(): boolean {
  const host = process.env.SMTP_HOST
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  if (!host) return false

  // If host is the default mailtrap or gmail placeholders, check credentials
  if (host === 'smtp.mailtrap.io' || host === 'smtp.gmail.com') {
    if (!user || user === 'mailtrap_user' || user === 'yourstore@gmail.com') {
      return false
    }
    if (!pass || pass === 'mailtrap_password' || pass === 'app-specific-password') {
      return false
    }
  }

  // Also check if they are generic empty placeholders
  if (!user || !pass) {
    return false
  }

  return true
}

// Mock Transporter for local development and testing fallback
class MockTransporter {
  async sendMail(options: {
    from?: string
    to?: string | string[]
    subject?: string
    html?: string
    text?: string
    attachments?: Array<{
      filename: string
      path?: string
      href?: string
    }>
  }): Promise<{ messageId: string; response: string }> {
    const emailDir = './uploads/emails'
    try {
      if (!fs.existsSync(emailDir)) {
        fs.mkdirSync(emailDir, { recursive: true })
      }

      const cleanSubject = (options.subject || 'no-subject')
        .replace(/[^a-z0-9]/gi, '_')
        .toLowerCase()
      const filename = `email_${Date.now()}_${cleanSubject}.html`
      const filePath = `${emailDir}/${filename}`

      const previewHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Mock Email Preview - ${options.subject || 'No Subject'}</title>
          <style>
            .email-metadata {
              background: #f1f5f9;
              border-bottom: 2px solid #e2e8f0;
              padding: 16px;
              font-family: ui-sans-serif, system-ui, sans-serif;
              color: #334155;
            }
            .metadata-row { margin-bottom: 8px; }
            .metadata-label { font-weight: bold; width: 100px; display: inline-block; }
            .email-content { padding: 20px; }
          </style>
        </head>
        <body>
          <div class="email-metadata">
            <div class="metadata-row"><span class="metadata-label">From:</span> ${options.from || 'system'}</div>
            <div class="metadata-row"><span class="metadata-label">To:</span> ${options.to || 'recipient'}</div>
            <div class="metadata-row"><span class="metadata-label">Subject:</span> ${options.subject || 'No Subject'}</div>
            <div class="metadata-row"><span class="metadata-label">Date:</span> ${new Date().toLocaleString()}</div>
            ${
              options.attachments && options.attachments.length > 0
                ? `
              <div class="metadata-row">
                <span class="metadata-label">Attachments:</span>
                ${options.attachments
                  .map(
                    (a) =>
                      `${a.filename || 'file'} (${a.path || a.href || 'inline data'})`
                  )
                  .join(', ')}
              </div>
            `
                : ''
            }
          </div>
          <div class="email-content">
            ${options.html || `<pre>${options.text || ''}</pre>`}
          </div>
        </body>
        </html>
      `

      // Guard mock-preview disk write — only in development (RI1 — no ephemeral disk in production)
      if (process.env.NODE_ENV !== 'production') {
        fs.writeFileSync(filePath, previewHtml)

        console.log('╔═══════════════════════════════════════════════════════════════════╗')
        console.log(`║ 📧 [Mock Email] Sent successfully to ${options.to}`)
        console.log(`║ Subject: ${options.subject}`)
        console.log(`║ Saved Preview to: ${filePath}`)
        console.log('╚═══════════════════════════════════════════════════════════════════╝')
      } else {
        console.log(`[Mock Email] Email to ${options.to} - Subject: ${options.subject} (preview not saved in production)`)
      }

      return {
        messageId: `mock-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        response: '250 OK - Mock Email Saved Successfully',
      }
    } catch (err) {
      console.error('[Mock Email] Failed to save simulated email:', err)
      throw err
    }
  }
}

/**
 * The From address for every outgoing email.
 *
 * Previously each send site interpolated SMTP_USER directly, which only worked
 * because SMTP_USER happened to be a mailbox. Resend sends from a verified
 * DOMAIN, not from the credential, so the two are no longer the same thing and
 * the address needs its own variable.
 */
function getFromAddress(displayNameSuffix?: string): string {
  const config = getStoreConfig()
  // EMAIL_FROM is required for Resend. SMTP_USER remains the fallback so an
  // existing SMTP-configured deployment keeps working untouched.
  const address = process.env.EMAIL_FROM || process.env.SMTP_USER || 'onboarding@resend.dev'
  const name = displayNameSuffix ? `${config.store.name} ${displayNameSuffix}` : config.store.name
  return `"${name}" <${address}>`
}

/**
 * Resend-backed transport exposing the same sendMail shape as Nodemailer, so the
 * seven send functions did not have to change.
 *
 * Preferred over SMTP because this service runs on a free-tier instance that
 * spins down: an HTTPS call has no connection to establish and reports failures
 * as a structured response rather than an SMTP timeout the queue can only retry
 * blindly.
 */
class ResendTransporter {
  private readonly client: Resend

  constructor(apiKey: string) {
    this.client = new Resend(apiKey)
  }

  async sendMail(options: {
    from?: string
    to?: string | string[]
    subject?: string
    html?: string
    text?: string
    attachments?: Array<{ filename: string; path?: string; href?: string }>
  }): Promise<{ messageId: string; response: string }> {
    // Nodemailer distinguishes `path` (local file) from `href` (remote URL);
    // Resend takes `path` for a URL and `content` for bytes. In production the
    // invoice is always a remote URL, because the startup guard forbids local
    // storage there — the readFile branch only runs in local dev.
    const attachments = options.attachments?.map((a) => {
      const remote = a.href ?? (a.path?.startsWith('http') ? a.path : undefined)
      if (remote) return { filename: a.filename, path: remote }
      return { filename: a.filename, content: fs.readFileSync(path.resolve(a.path!)) }
    })

    const { data, error } = await this.client.emails.send({
      from: options.from ?? getFromAddress(),
      to: Array.isArray(options.to) ? options.to : [options.to as string],
      subject: options.subject ?? '',
      html: options.html ?? '',
      ...(options.text ? { text: options.text } : {}),
      ...(attachments?.length ? { attachments } : {}),
    } as never)

    // Resend returns errors in the response body rather than throwing. Throwing
    // here is deliberate: these sends run inside BullMQ jobs, and a job must fail
    // to be retried.
    if (error) {
      throw new Error(`Resend refused the message: ${error.message ?? JSON.stringify(error)}`)
    }

    return { messageId: data?.id ?? 'unknown', response: 'sent via Resend' }
  }
}

export type EmailProvider = 'resend' | 'smtp' | 'mock'

/**
 * Which provider is active. Mirrors storage.service.ts's precedence chain:
 * a configured cloud provider wins, with a local fallback for development.
 */
export function getActiveEmailProvider(): EmailProvider {
  if (process.env.RESEND_API_KEY) return 'resend'
  if (isSmtpConfigured()) return 'smtp'
  return 'mock'
}

// Create transporter
function createTransporter(): any {
  const provider = getActiveEmailProvider()

  if (provider === 'resend') {
    return new ResendTransporter(process.env.RESEND_API_KEY as string)
  }

  if (provider === 'mock') {
    console.log('[Email] No email provider configured. Using development Mock Email fallback.')
    return new MockTransporter()
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}

export async function sendOrderConfirmationEmail(
  order: OrderWithRelations,
  invoicePath: string
): Promise<void> {
  const config = getStoreConfig()

  // Skip if email service is disabled
  if (!config.features.emailService) return

  const transporter = createTransporter()

  const itemsHtml = order.items
    .map(
      (item) => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.product.name}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">₹${item.unitPrice.toNumber().toFixed(2)}</td>
        </tr>
      `
    )
    .join('')

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: ${config.store.primaryColor}; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .order-info { background: white; padding: 15px; margin: 15px 0; border-radius: 8px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f0f0f0; padding: 10px; text-align: left; }
        .total { font-size: 18px; font-weight: bold; color: ${config.store.primaryColor}; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        .button { display: inline-block; background: ${config.store.primaryColor}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${config.store.name}</h1>
          <p>Order Confirmation</p>
        </div>
        
        <div class="content">
          <p>Hi ${order.user.name},</p>
          <p>Thank you for your order! Your order has been confirmed and is being processed.</p>
          
          <div class="order-info">
            <h3>Order Details</h3>
            <p><strong>Order Number:</strong> ${order.orderNumber}</p>
            <p><strong>Order Date:</strong> ${new Date(order.createdAt).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
            })}</p>
            
            <h4 style="margin-top: 20px;">Shipping Address</h4>
            <p>${order.address.label}: ${order.address.line1}${order.address.line2 ? ', ' + order.address.line2 : ''}</p>
            <p>${order.address.city}, ${order.address.state} - ${order.address.pincode}</p>
          </div>
          
          <div class="order-info">
            <h4>Items Ordered</h4>
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th style="text-align: center;">Qty</th>
                  <th style="text-align: right;">Price</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>
            
            <p class="total" style="text-align: right; margin-top: 15px;">
              Total: ₹${order.total.toNumber().toFixed(2)}
            </p>
          </div>
          
          <p style="text-align: center; margin-top: 20px;">
            <a href="${process.env.FRONTEND_URL}/orders/${order.id}" class="button">Track Your Order</a>
          </p>
          
          <p style="margin-top: 20px;">
            If you have any questions, please contact us at ${config.store.contact.email} or WhatsApp us at ${config.store.contact.whatsapp}.
          </p>
        </div>
        
        <div class="footer">
          <p>${config.store.name}</p>
          <p>${config.store.address.line1}, ${config.store.address.city}, ${config.store.address.state} - ${config.store.address.pincode}</p>
          <p>GSTIN: ${config.store.gstNumber}</p>
        </div>
      </div>
    </body>
    </html>
  `

  await transporter.sendMail({
    from: getFromAddress(),
    to: order.user.email,
    subject: `Order Confirmed - ${order.orderNumber} | ${config.store.name}`,
    html,
    attachments: [
      {
        filename: `invoice-${order.orderNumber}.pdf`,
        ...(invoicePath.startsWith('http') ? { href: invoicePath } : { path: invoicePath }),
      },
    ],
  })
}

export async function sendInvoiceEmail(
  order: OrderWithRelations,
  invoicePath: string
): Promise<void> {
  const config = getStoreConfig()

  if (!config.features.emailService) {
    throw new Error('Email service is disabled')
  }

  const transporter = createTransporter()

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 560px; margin: 0 auto; padding: 20px; }
        .header { background: ${config.store.primaryColor}; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .order-info { background: white; padding: 15px; margin: 15px 0; border-radius: 8px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${config.store.name}</h1>
          <p>Invoice Copy</p>
        </div>
        <div class="content">
          <p>Hi ${order.user.name},</p>
          <p>Your invoice for order <strong>${order.orderNumber}</strong> is attached to this email.</p>
          <div class="order-info">
            <p><strong>Order Number:</strong> ${order.orderNumber}</p>
            <p><strong>Order Date:</strong> ${new Date(order.createdAt).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
            })}</p>
            <p><strong>Total:</strong> ₹${order.total.toNumber().toFixed(2)}</p>
          </div>
          <p>If you have any questions, please contact us at ${config.store.contact.email}.</p>
        </div>
        <div class="footer">
          <p>${config.store.name}</p>
          <p>GSTIN: ${config.store.gstNumber}</p>
        </div>
      </div>
    </body>
    </html>
  `

  await transporter.sendMail({
    from: getFromAddress(),
    to: order.user.email,
    subject: `Invoice - ${order.orderNumber} | ${config.store.name}`,
    html,
    attachments: [
      {
        filename: `invoice-${order.orderNumber}.pdf`,
        ...(invoicePath.startsWith('http') ? { href: invoicePath } : { path: invoicePath }),
      },
    ],
  })
}

export async function sendOtpEmail(
  email: string,
  otp: string,
  purpose: 'verification' | 'password-reset'
): Promise<void> {
  const config = getStoreConfig()
  const transporter = createTransporter()

  const subject = purpose === 'verification' ? 'Email Verification OTP' : 'Password Reset OTP'
  const bodyText =
    purpose === 'verification'
      ? 'Your email verification OTP is'
      : 'Your password reset OTP is'

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 500px; margin: 0 auto; padding: 20px; }
        .otp { font-size: 32px; font-weight: bold; color: ${config.store.primaryColor}; letter-spacing: 8px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>${config.store.name}</h2>
        <p>${bodyText}</p>
        <p class="otp">${otp}</p>
        <p>This OTP will expire in 10 minutes.</p>
        <p>If you did not request this, please ignore this email.</p>
      </div>
    </body>
    </html>
  `

  await transporter.sendMail({
    from: getFromAddress(),
    to: email,
    subject: `${subject} | ${config.store.name}`,
    html,
  })
}

// ─── Shipping Status Labels ───
const shipmentStatusLabels: Record<string, string> = {
  PROCESSING: 'Being Prepared',
  DISPATCHED: 'Dispatched',
  IN_TRANSIT: 'In Transit',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Delivered',
  FAILED: 'Delivery Failed',
  RTO: 'Returned to Origin',
}

interface ShippingUpdateOrder {
  id: string
  orderNumber: string
  user: { name: string; email: string }
}

interface ShippingUpdateDetails {
  status: string
  courierPartner: string
  awbNumber?: string | null
  trackingUrl?: string | null
  expectedBy?: Date | null
}

export async function sendShippingUpdateEmail(
  order: ShippingUpdateOrder,
  shipping: ShippingUpdateDetails
): Promise<void> {
  const config = getStoreConfig()
  if (!config.features.emailService) return

  const transporter = createTransporter()
  const statusLabel = shipmentStatusLabels[shipping.status] || shipping.status

  const finalTrackingUrl = shipping.trackingUrl || (shipping.awbNumber && shipping.courierPartner ? getTrackingUrl(shipping.courierPartner, shipping.awbNumber) : null)

  const trackingSection = finalTrackingUrl && shipping.awbNumber
    ? `
      <div style="background: #f0f9ff; padding: 16px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0 0 8px;"><strong>Courier:</strong> ${shipping.courierPartner}</p>
        <p style="margin: 0 0 8px;"><strong>Tracking Number:</strong> ${shipping.awbNumber}</p>
        <p style="margin: 0; text-align: center;">
          <a href="${finalTrackingUrl}" style="display: inline-block; background: ${config.store.primaryColor}; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Track Your Package</a>
        </p>
      </div>
    `
    : ''

  const expectedSection = shipping.expectedBy
    ? `<p><strong>Expected delivery:</strong> ${new Date(shipping.expectedBy).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</p>`
    : ''

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: ${config.store.primaryColor}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { padding: 20px; background: #f9f9f9; border-radius: 0 0 8px 8px; }
        .status-badge { display: inline-block; background: ${config.store.accentColor}; color: #000; padding: 6px 16px; border-radius: 20px; font-weight: bold; font-size: 14px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0;">${config.store.name}</h1>
          <p style="margin: 8px 0 0;">Shipping Update</p>
        </div>
        <div class="content">
          <p>Hi ${order.user.name},</p>
          <p>Your order <strong>${order.orderNumber}</strong> has a shipping update:</p>
          
          <p style="text-align: center; margin: 20px 0;">
            <span class="status-badge">${statusLabel}</span>
          </p>

          ${trackingSection}
          ${expectedSection}

          <p style="text-align: center; margin-top: 20px;">
            <a href="${process.env.FRONTEND_URL}/orders/${order.id}" style="display: inline-block; background: ${config.store.primaryColor}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">View Order Details</a>
          </p>

          <p style="margin-top: 20px;">
            Questions? Contact us at ${config.store.contact.email} or WhatsApp ${config.store.contact.whatsapp}.
          </p>
        </div>
        <div class="footer">
          <p>${config.store.name}</p>
          <p>${config.store.address.line1}, ${config.store.address.city}, ${config.store.address.state} - ${config.store.address.pincode}</p>
        </div>
      </div>
    </body>
    </html>
  `

  await transporter.sendMail({
    from: getFromAddress(),
    to: order.user.email,
    subject: `Order ${order.orderNumber} — ${statusLabel} | ${config.store.name}`,
    html,
  })
}

interface CancelledOrder {
  id: string
  orderNumber: string
  total: { toNumber: () => number }
  user: { name: string; email: string }
}

export async function sendOrderCancelledEmail(
  order: CancelledOrder
): Promise<void> {
  const config = getStoreConfig()
  if (!config.features.emailService) return

  const transporter = createTransporter()

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #dc2626; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { padding: 20px; background: #f9f9f9; border-radius: 0 0 8px 8px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0;">${config.store.name}</h1>
          <p style="margin: 8px 0 0;">Order Cancelled</p>
        </div>
        <div class="content">
          <p>Hi ${order.user.name},</p>
          <p>Your order <strong>${order.orderNumber}</strong> has been cancelled.</p>
          
          <div style="background: white; padding: 16px; border-radius: 8px; margin: 20px 0; border: 1px solid #eee;">
            <p style="margin: 0 0 8px;"><strong>Order Number:</strong> ${order.orderNumber}</p>
            <p style="margin: 0;"><strong>Order Total:</strong> ₹${order.total.toNumber().toFixed(2)}</p>
          </div>

          <p>If you paid for this order, a refund will be initiated within 5-7 business days.</p>

          <p style="text-align: center; margin-top: 20px;">
            <a href="${process.env.FRONTEND_URL}/products" style="display: inline-block; background: ${config.store.primaryColor}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">Continue Shopping</a>
          </p>

          <p style="margin-top: 20px;">
            Questions? Contact us at ${config.store.contact.email} or WhatsApp ${config.store.contact.whatsapp}.
          </p>
        </div>
        <div class="footer">
          <p>${config.store.name}</p>
          <p>${config.store.address.line1}, ${config.store.address.city}, ${config.store.address.state} - ${config.store.address.pincode}</p>
        </div>
      </div>
    </body>
    </html>
  `

  await transporter.sendMail({
    from: getFromAddress(),
    to: order.user.email,
    subject: `Order Cancelled — ${order.orderNumber} | ${config.store.name}`,
    html,
  })
}

export async function sendRmaCreatedAdminNotificationEmail(
  rmaId: string
): Promise<void> {
  const config = getStoreConfig()
  if (!config.features.emailService) return

  const rma = await prisma.rMARequest.findUnique({
    where: { id: rmaId },
    include: {
      user: true,
      order: true,
      items: {
        include: {
          orderItem: {
            include: {
              product: true,
            },
          },
        },
      },
    },
  })

  if (!rma) {
    console.error(`[Email] RMA request not found for notification: ${rmaId}`)
    return
  }

  const transporter = createTransporter()

  const itemsHtml = rma.items
    .map(
      (item) => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.orderItem.product.name}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">₹${Number(item.orderItem.unitPrice).toFixed(2)}</td>
        </tr>
      `
    )
    .join('')

  const adminDashboardUrl = `${process.env.ADMIN_URL || 'http://localhost:3001'}/returns/${rma.id}`

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #f59e0b; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { padding: 20px; background: #f9f9f9; border-radius: 0 0 8px 8px; }
        .info-card { background: white; padding: 15px; margin: 15px 0; border-radius: 8px; border: 1px solid #e2e8f0; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f0f0f0; padding: 10px; text-align: left; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        .button { display: inline-block; background: #f59e0b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0;">New ${rma.type === 'RETURN' ? 'Return' : 'Replacement'} Request</h1>
          <p style="margin: 8px 0 0;">RMA Request #${rma.rmaNumber}</p>
        </div>
        
        <div class="content">
          <p>Hello Admin,</p>
          <p>A new <strong>${rma.type === 'RETURN' ? 'Return' : 'Replacement'}</strong> request has been submitted for Order <strong>#${rma.order.orderNumber}</strong> by <strong>${rma.user.name}</strong>.</p>
          
          <div class="info-card">
            <h3 style="margin-top: 0; color: #f59e0b;">Request Summary</h3>
            <p><strong>RMA Number:</strong> ${rma.rmaNumber}</p>
            <p><strong>Order Number:</strong> ${rma.order.orderNumber}</p>
            <p><strong>Customer Name:</strong> ${rma.user.name}</p>
            <p><strong>Customer Email:</strong> ${rma.user.email}</p>
            <p><strong>Customer Phone:</strong> ${rma.user.phone}</p>
            <p><strong>Reason:</strong> ${rma.reason.replace('_', ' ')}</p>
            ${rma.customerNote ? `<p><strong>Customer Note:</strong> ${rma.customerNote}</p>` : ''}
            <p><strong>Request Date:</strong> ${new Date(rma.createdAt).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}</p>
          </div>
          
          <div class="info-card">
            <h3 style="margin-top: 0;">Items Requested</h3>
            <table>
              <thead>
                <tr>
                  <th style="padding: 8px; text-align: left; background: #f8fafc;">Product</th>
                  <th style="padding: 8px; text-align: center; background: #f8fafc;">Qty</th>
                  <th style="padding: 8px; text-align: right; background: #f8fafc;">Price</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>
          </div>
          
          <p style="text-align: center; margin-top: 30px;">
            <a href="${adminDashboardUrl}" class="button">View & Process RMA in Dashboard</a>
          </p>
        </div>
        
        <div class="footer">
          <p>This is an automated system notification from ${config.store.name}.</p>
        </div>
      </div>
    </body>
    </html>
  `

  try {
    await transporter.sendMail({
      from: getFromAddress('Support'),
      to: config.store.contact.email,
      subject: `[New RMA] #${rma.rmaNumber} - ${rma.type} Request for Order #${rma.order.orderNumber} | ${config.store.name}`,
      html,
    })
    console.log(`[Email] RMA created notification sent to store admin at ${config.store.contact.email}`)
  } catch (error) {
    console.error('[Email] Failed to send RMA admin notification:', error)
  }
}

export async function sendRmaApprovedCustomerNotificationEmail(
  rmaId: string
): Promise<void> {
  const config = getStoreConfig()
  if (!config.features.emailService) return

  const rma = await prisma.rMARequest.findUnique({
    where: { id: rmaId },
    include: {
      user: true,
      order: true,
      items: {
        include: {
          orderItem: {
            include: {
              product: true,
            },
          },
        },
      },
    },
  })

  if (!rma) {
    console.error(`[Email] RMA request not found for notification: ${rmaId}`)
    return
  }

  const transporter = createTransporter()

  const itemsHtml = rma.items
    .map(
      (item) => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.orderItem.product.name}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
        </tr>
      `
    )
    .join('')

  const statusTrackingUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/orders/${rma.order.id}`

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: ${config.store.primaryColor}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { padding: 20px; background: #f9f9f9; border-radius: 0 0 8px 8px; }
        .info-card { background: white; padding: 15px; margin: 15px 0; border-radius: 8px; border: 1px solid #e2e8f0; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f0f0f0; padding: 10px; text-align: left; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        .button { display: inline-block; background: ${config.store.primaryColor}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; }
        .next-steps-list { padding-left: 20px; margin: 10px 0; }
        .next-steps-list li { margin-bottom: 8px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0;">Request Approved</h1>
          <p style="margin: 8px 0 0;">RMA Request #${rma.rmaNumber}</p>
        </div>
        
        <div class="content">
          <p>Hi ${rma.user.name},</p>
          <p>Great news! Your <strong>${rma.type === 'RETURN' ? 'Return' : 'Replacement'}</strong> request has been <strong>approved</strong> by our team.</p>
          
          <div class="info-card">
            <h3 style="margin-top: 0; color: ${config.store.primaryColor};">Request Details</h3>
            <p><strong>RMA Number:</strong> ${rma.rmaNumber}</p>
            <p><strong>Order Number:</strong> ${rma.order.orderNumber}</p>
            <p><strong>Request Type:</strong> ${rma.type}</p>
            <p><strong>Status:</strong> APPROVED</p>
            ${rma.adminNote ? `<p><strong>Merchant Instructions:</strong> ${rma.adminNote}</p>` : ''}
          </div>
          
          <div class="info-card">
            <h3 style="margin-top: 0;">Approved Items</h3>
            <table>
              <thead>
                <tr>
                  <th style="padding: 8px; text-align: left; background: #f8fafc;">Product</th>
                  <th style="padding: 8px; text-align: center; background: #f8fafc;">Qty</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>
          </div>

          <div class="info-card" style="border-left: 4px solid ${config.store.accentColor}; background: #fffbeb;">
            <h3 style="margin-top: 0; color: #b45309;">What Happens Next?</h3>
            <ul class="next-steps-list">
              <li><strong>Reverse Pickup:</strong> Our courier partner will schedule a reverse pickup from your delivery address.</li>
              <li><strong>Keep it Ready:</strong> Please ensure the item is packed securely in its original packaging with all tags, labels, and accessories intact.</li>
              <li><strong>Verification:</strong> Once the package is received at our facility and verified, your ${rma.type === 'RETURN' ? 'refund will be processed' : 'replacement will be shipped'}.</li>
            </ul>
          </div>
          
          <p style="text-align: center; margin-top: 30px;">
            <a href="${statusTrackingUrl}" class="button">Track Request Status</a>
          </p>
          
          <p style="margin-top: 20px;">
            If you have any questions, feel free to contact us at ${config.store.contact.email} or WhatsApp us at ${config.store.contact.whatsapp}.
          </p>
        </div>
        
        <div class="footer">
          <p>Thank you for shopping with ${config.store.name}!</p>
          <p>${config.store.name} Support Team</p>
        </div>
      </div>
    </body>
    </html>
  `

  try {
    await transporter.sendMail({
      from: getFromAddress(),
      to: rma.user.email,
      subject: `Your ${rma.type === 'RETURN' ? 'Return' : 'Replacement'} Request #${rma.rmaNumber} has been Approved | ${config.store.name}`,
      html,
    })
    console.log(`[Email] RMA approved notification sent to customer at ${rma.user.email}`)
  } catch (error) {
    console.error('[Email] Failed to send RMA customer notification:', error)
  }
}

