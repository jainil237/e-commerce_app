"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateInvoicePdf = generateInvoicePdf;
const pdfkit_1 = __importDefault(require("pdfkit"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const config_1 = require("../utils/config");
const storage_service_1 = require("./storage.service");
async function generateInvoicePdf(order) {
    const config = (0, config_1.getStoreConfig)();
    // Create invoices directory locally as fallback
    const invoicesDir = path_1.default.join(process.cwd(), 'uploads', 'invoices');
    if (!fs_1.default.existsSync(invoicesDir)) {
        fs_1.default.mkdirSync(invoicesDir, { recursive: true });
    }
    const invoiceFileName = `${order.id}-invoice.pdf`;
    const invoicePath = path_1.default.join(invoicesDir, invoiceFileName);
    // Get invoice number from config
    const invoiceNumber = `${config.invoice.prefix}-${config.invoice.startNumber}`;
    const doc = new pdfkit_1.default({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
    });
    // We capture the PDF chunks in memory so we can upload it directly to Cloudflare R2
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    // For fallback, we also write to local disk
    const stream = fs_1.default.createWriteStream(invoicePath);
    doc.pipe(stream);
    // Header
    doc.fontSize(24).font('Helvetica-Bold').text(config.store.name, { align: 'center' });
    doc.fontSize(10).font('Helvetica').text(config.store.address.line1, { align: 'center' });
    doc.text(`${config.store.address.city}, ${config.store.address.state} - ${config.store.address.pincode}`, { align: 'center' });
    doc.text(`GSTIN: ${config.store.gstNumber}`, { align: 'center' });
    doc.moveDown();
    // Invoice title
    doc.fontSize(16).font('Helvetica-Bold').text('TAX INVOICE', { align: 'center' });
    doc.moveDown();
    // Invoice details
    doc.fontSize(10).font('Helvetica');
    const invoiceDetailsY = doc.y;
    doc.text(`Invoice No: ${invoiceNumber}`, 50, invoiceDetailsY);
    doc.text(`Date: ${formatDate(order.createdAt)}`, 50, invoiceDetailsY + 15);
    doc.text(`Order No: ${order.orderNumber}`, 50, invoiceDetailsY + 30);
    doc.text(`Payment ID: ${order.razorpayPaymentId || 'N/A'}`, 350, invoiceDetailsY);
    doc.text(`Payment Method: Razorpay`, 350, invoiceDetailsY + 15);
    doc.moveDown(2);
    // Bill to
    doc.fontSize(10).font('Helvetica-Bold').text('Bill To:', { underline: true });
    doc.font('Helvetica');
    doc.text(order.user.name);
    doc.text(order.user.email);
    doc.text(order.user.phone);
    doc.moveDown();
    // Ship to
    doc.fontSize(10).font('Helvetica-Bold').text('Ship To:', { underline: true });
    doc.font('Helvetica');
    doc.text(`${order.address.label}: ${order.address.line1}`);
    if (order.address.line2) {
        doc.text(order.address.line2);
    }
    doc.text(`${order.address.city}, ${order.address.state} - ${order.address.pincode}`);
    doc.moveDown();
    // Items table
    const tableTop = doc.y + 10;
    const colWidths = [200, 50, 80, 50, 80];
    const colPositions = [50, 250, 300, 380, 430];
    // Table header
    doc.fontSize(9).font('Helvetica-Bold');
    const headers = ['Product', 'Qty', 'Unit Price', 'GST%', 'Amount'];
    headers.forEach((header, i) => {
        doc.text(header, colPositions[i], tableTop);
    });
    // Draw header line
    doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();
    // Table rows
    let rowY = tableTop + 25;
    doc.font('Helvetica');
    for (const item of order.items) {
        const unitPrice = item.unitPrice.toNumber();
        const subtotal = item.subtotal.toNumber();
        doc.text(item.product.name, colPositions[0], rowY, { width: colWidths[0] });
        doc.text(item.quantity.toString(), colPositions[1], rowY);
        doc.text(`₹${unitPrice.toFixed(2)}`, colPositions[2], rowY);
        doc.text(`${item.gstPercent}%`, colPositions[3], rowY);
        doc.text(`₹${subtotal.toFixed(2)}`, colPositions[4], rowY);
        rowY += 20;
    }
    // Draw line before totals
    doc.moveTo(50, rowY).lineTo(550, rowY).stroke();
    rowY += 10;
    // Totals
    const subtotal = order.subtotal.toNumber();
    const shipping = order.shippingCharge.toNumber();
    const discount = order.discount.toNumber();
    const gst = order.gstAmount.toNumber();
    const total = order.total.toNumber();
    doc.fontSize(10);
    doc.text(`Subtotal:`, 350, rowY);
    doc.text(`₹${subtotal.toFixed(2)}`, 430, rowY);
    rowY += 15;
    if (shipping > 0) {
        doc.text(`Shipping:`, 350, rowY);
        doc.text(`₹${shipping.toFixed(2)}`, 430, rowY);
        rowY += 15;
    }
    if (discount > 0) {
        doc.text(`Discount:`, 350, rowY);
        doc.text(`-₹${discount.toFixed(2)}`, 430, rowY);
        rowY += 15;
    }
    doc.text(`GST:`, 350, rowY);
    doc.text(`₹${gst.toFixed(2)}`, 430, rowY);
    rowY += 15;
    // Grand total
    doc.font('Helvetica-Bold');
    doc.text(`Grand Total:`, 350, rowY);
    doc.text(`₹${total.toFixed(2)}`, 430, rowY);
    // Terms and conditions
    rowY += 50;
    doc.font('Helvetica').fontSize(8);
    doc.text('Terms & Conditions:', { underline: true });
    doc.text(config.invoice.termsAndConditions, { width: 450 });
    // Footer
    doc.moveDown(2);
    doc.fontSize(10).font('Helvetica');
    doc.text(config.invoice.footerNote, { align: 'center' });
    return new Promise((resolve, reject) => {
        doc.on('end', async () => {
            try {
                const pdfBuffer = Buffer.concat(chunks);
                const provider = (0, storage_service_1.getActiveProvider)();
                if (provider === 'local') {
                    // For pure local mode, wait for the local file write stream to finish
                    stream.on('finish', () => resolve(invoicePath));
                    stream.on('error', reject);
                }
                else {
                    // Upload to cloud (R2 or Cloudinary)
                    const cloudUrl = await (0, storage_service_1.uploadBuffer)(pdfBuffer, invoiceFileName, 'application/pdf', 'invoices');
                    resolve(cloudUrl);
                }
            }
            catch (err) {
                reject(err);
            }
        });
        doc.on('error', reject);
        // End the document AFTER listeners are attached to avoid race condition
        doc.end();
    });
}
function formatDate(date) {
    return new Date(date).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}
//# sourceMappingURL=invoice.service.js.map