"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendOrderConfirmationEmail = sendOrderConfirmationEmail;
exports.sendInvoiceEmail = sendInvoiceEmail;
exports.sendOtpEmail = sendOtpEmail;
exports.sendShippingUpdateEmail = sendShippingUpdateEmail;
exports.sendOrderCancelledEmail = sendOrderCancelledEmail;
const nodemailer_1 = __importDefault(require("nodemailer"));
const config_1 = require("../utils/config");
// Create transporter
function createTransporter() {
    return nodemailer_1.default.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });
}
async function sendOrderConfirmationEmail(order, invoicePath) {
    const config = (0, config_1.getStoreConfig)();
    // Skip if email service is disabled or SMTP not configured
    if (!config.features.emailService)
        return;
    if (!process.env.SMTP_HOST || process.env.SMTP_HOST === 'smtp.mailtrap.io') {
        console.log('[Email] SMTP not configured — skipping order confirmation email');
        return;
    }
    const transporter = createTransporter();
    const itemsHtml = order.items
        .map((item) => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.product.name}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">₹${item.unitPrice.toNumber().toFixed(2)}</td>
        </tr>
      `)
        .join('');
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
  `;
    await transporter.sendMail({
        from: `"${config.store.name}" <${process.env.SMTP_USER}>`,
        to: order.user.email,
        subject: `Order Confirmed - ${order.orderNumber} | ${config.store.name}`,
        html,
        attachments: [
            {
                filename: `invoice-${order.orderNumber}.pdf`,
                ...(invoicePath.startsWith('http') ? { href: invoicePath } : { path: invoicePath }),
            },
        ],
    });
}
async function sendInvoiceEmail(order, invoicePath) {
    const config = (0, config_1.getStoreConfig)();
    if (!config.features.emailService) {
        throw new Error('Email service is disabled');
    }
    if (!process.env.SMTP_HOST || process.env.SMTP_HOST === 'smtp.mailtrap.io') {
        throw new Error('SMTP is not configured');
    }
    const transporter = createTransporter();
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
  `;
    await transporter.sendMail({
        from: `"${config.store.name}" <${process.env.SMTP_USER}>`,
        to: order.user.email,
        subject: `Invoice - ${order.orderNumber} | ${config.store.name}`,
        html,
        attachments: [
            {
                filename: `invoice-${order.orderNumber}.pdf`,
                ...(invoicePath.startsWith('http') ? { href: invoicePath } : { path: invoicePath }),
            },
        ],
    });
}
async function sendOtpEmail(email, otp, purpose) {
    const config = (0, config_1.getStoreConfig)();
    const transporter = createTransporter();
    const subject = purpose === 'verification' ? 'Email Verification OTP' : 'Password Reset OTP';
    const bodyText = purpose === 'verification'
        ? 'Your email verification OTP is'
        : 'Your password reset OTP is';
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
  `;
    await transporter.sendMail({
        from: `"${config.store.name}" <${process.env.SMTP_USER}>`,
        to: email,
        subject: `${subject} | ${config.store.name}`,
        html,
    });
}
// ─── Shipping Status Labels ───
const shipmentStatusLabels = {
    PROCESSING: 'Being Prepared',
    DISPATCHED: 'Dispatched',
    IN_TRANSIT: 'In Transit',
    OUT_FOR_DELIVERY: 'Out for Delivery',
    DELIVERED: 'Delivered',
    FAILED: 'Delivery Failed',
    RTO: 'Returned to Origin',
};
async function sendShippingUpdateEmail(order, shipping) {
    const config = (0, config_1.getStoreConfig)();
    if (!config.features.emailService)
        return;
    const transporter = createTransporter();
    const statusLabel = shipmentStatusLabels[shipping.status] || shipping.status;
    const trackingSection = shipping.trackingUrl && shipping.awbNumber
        ? `
      <div style="background: #f0f9ff; padding: 16px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0 0 8px;"><strong>Courier:</strong> ${shipping.courierPartner}</p>
        <p style="margin: 0 0 8px;"><strong>Tracking Number:</strong> ${shipping.awbNumber}</p>
        <p style="margin: 0; text-align: center;">
          <a href="${shipping.trackingUrl}" style="display: inline-block; background: ${config.store.primaryColor}; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Track Your Package</a>
        </p>
      </div>
    `
        : '';
    const expectedSection = shipping.expectedBy
        ? `<p><strong>Expected delivery:</strong> ${new Date(shipping.expectedBy).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</p>`
        : '';
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
  `;
    await transporter.sendMail({
        from: `"${config.store.name}" <${process.env.SMTP_USER}>`,
        to: order.user.email,
        subject: `Order ${order.orderNumber} — ${statusLabel} | ${config.store.name}`,
        html,
    });
}
async function sendOrderCancelledEmail(order) {
    const config = (0, config_1.getStoreConfig)();
    if (!config.features.emailService)
        return;
    const transporter = createTransporter();
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
  `;
    await transporter.sendMail({
        from: `"${config.store.name}" <${process.env.SMTP_USER}>`,
        to: order.user.email,
        subject: `Order Cancelled — ${order.orderNumber} | ${config.store.name}`,
        html,
    });
}
//# sourceMappingURL=email.service.js.map