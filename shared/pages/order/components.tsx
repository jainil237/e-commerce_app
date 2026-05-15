'use client';

import React from 'react';
import { CheckCircle, Package, MapPin, Truck, Phone, Mail } from 'lucide-react';
import { FallbackImage } from '../../components/FallbackImage';
import { SharedBadge } from '../../components/UIPrimitives';
import { Order, OrderItem, ViewerContext } from '../../types';
import { formatCurrency, formatDate } from '../../utils';

const statusSteps = ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'];

export const OrderHeader: React.FC<{ order: Order; viewer: ViewerContext }> = ({ order, viewer }) => {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-black text-[var(--text-primary)]">Order #{order.orderNumber}</h1>
        <p className="text-[var(--text-secondary)] mt-1">Placed on {formatDate(order.createdAt)}</p>
      </div>
      <div className="flex flex-col gap-3 items-end">
        <SharedBadge variant={order.paymentStatus === 'PAID' ? 'success' : 'warning'} className="px-4 py-1 text-sm font-bold tracking-wider">
          {order.paymentStatus}
        </SharedBadge>
        
        {viewer === 'admin' && order.user && (
          <div className="flex flex-col items-end gap-1">
            <p className="text-[10px] text-[var(--text-tertiary)] uppercase font-black tracking-widest">Customer</p>
            <a 
              href={`/customers/${order.user.id}`}
              className="group flex flex-col items-end"
            >
              <span className="text-sm font-bold text-[var(--brand-primary)] group-hover:underline">{order.user.name}</span>
              <span className="text-xs text-[var(--text-secondary)]">{order.user.email}</span>
              <span className="text-xs text-[var(--text-secondary)]">{order.user.phone}</span>
            </a>
          </div>
        )}
      </div>
    </div>
  );
};

export const OrderStatusTracker: React.FC<{ order: Order }> = ({ order }) => {
  const currentStepIndex = order.status === 'PENDING' ? 0 : statusSteps.indexOf(order.status);
  
  if (order.status === 'CANCELLED') {
    return (
      <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 rounded-2xl p-4 flex items-center gap-3 text-red-600 dark:text-red-400">
        <CheckCircle className="w-6 h-6 rotate-45" />
        <span className="font-bold">This order has been cancelled</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between py-4">
      {statusSteps.map((step, index) => {
        const isCompleted = index <= currentStepIndex;
        const isCurrent = index === currentStepIndex;
        return (
          <div key={step} className="flex-1 flex flex-col items-center relative">
            {/* Line */}
            {index < statusSteps.length - 1 && (
              <div className={`absolute top-5 left-1/2 w-full h-0.5 ${
                index < currentStepIndex ? 'bg-[var(--success)]' : 'bg-[var(--border-subtle)]'
              }`} />
            )}
            
            <div className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center transition-all ${
              isCompleted ? 'bg-[var(--success)] text-white' : 'bg-[var(--surface-2)] text-[var(--text-tertiary)]'
            } ${isCurrent ? 'ring-4 ring-[var(--success)]/20 scale-110' : ''}`}>
              {isCompleted ? <CheckCircle className="w-6 h-6" /> : <span className="font-bold">{index + 1}</span>}
            </div>
            <p className={`text-[10px] md:text-xs mt-3 font-bold uppercase tracking-wider ${
              isCompleted ? 'text-[var(--success)]' : 'text-[var(--text-tertiary)]'
            }`}>
              {index === 0 && order.status === 'PENDING' ? 'PENDING' : step}
            </p>
          </div>
        );
      })}
    </div>
  );
};

export const OrderItemsList: React.FC<{ items: OrderItem[] }> = ({ items }) => {
  return (
    <div className="space-y-6">
      <h2 className="font-black text-xl text-[var(--text-primary)] flex items-center gap-2">
        <Package className="w-6 h-6 text-[var(--brand-primary)]" />
        Items ({items.length})
      </h2>
      <div className="space-y-4">
        {items.map((item) => (
          <div key={item.id} className="flex gap-4 p-4 rounded-2xl bg-[var(--surface-0)] border border-[var(--border-subtle)] transition-colors hover:border-[var(--brand-primary)] shadow-sm">
            <div className="relative w-20 h-20 bg-[var(--surface-0)] rounded-xl overflow-hidden flex-shrink-0 border border-[var(--border-subtle)]">
              <FallbackImage src={item.product.images[0]?.url} alt={item.product.name} fill className="object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-[var(--text-primary)] truncate">{item.product.name}</h3>
              <div className="flex items-center gap-4 mt-1 text-sm text-[var(--text-secondary)]">
                <span>Qty: <span className="font-bold text-[var(--text-primary)]">{item.quantity}</span></span>
                <span>Price: <span className="font-bold text-[var(--text-primary)]">{formatCurrency(item.unitPrice)}</span></span>
              </div>
              <p className="text-[10px] text-[var(--text-tertiary)] mt-1 uppercase font-bold tracking-tighter">GST: {item.gstPercent}% Included</p>
            </div>
            <div className="text-right flex flex-col justify-center">
              <p className="font-black text-[var(--text-primary)]">{formatCurrency(item.subtotal)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const OrderSummaryCard: React.FC<{ order: Order }> = ({ order }) => {
  return (
    <div className="bg-[var(--surface-2)] rounded-3xl p-6 border border-[var(--border-subtle)] space-y-4">
      <h2 className="font-black text-xl text-[var(--text-primary)] mb-2">Order Summary</h2>
      <div className="space-y-3 text-sm">
        <div className="flex justify-between text-[var(--text-secondary)]">
          <span>Subtotal</span>
          <span className="font-bold text-[var(--text-primary)]">{formatCurrency(order.subtotal)}</span>
        </div>
        <div className="flex justify-between text-[var(--text-secondary)]">
          <span>Shipping</span>
          <span className={`font-bold ${Number(order.shippingCharge) === 0 ? 'text-[var(--success)]' : 'text-[var(--text-primary)]'}`}>
            {Number(order.shippingCharge) === 0 ? 'FREE' : formatCurrency(order.shippingCharge)}
          </span>
        </div>
        {Number(order.discount) > 0 && (
          <div className="flex justify-between text-[var(--success)]">
            <span className="font-bold">Discount</span>
            <span className="font-bold">-{formatCurrency(order.discount)}</span>
          </div>
        )}
        <div className="flex justify-between text-[var(--text-secondary)] border-t border-[var(--border-subtle)] pt-3">
          <span>Taxes (GST)</span>
          <span className="font-bold text-[var(--text-primary)]">{formatCurrency(order.gstAmount)}</span>
        </div>
      </div>
      <div className="flex justify-between items-baseline pt-4 border-t-2 border-dashed border-[var(--border-subtle)]">
        <span className="text-lg font-bold text-[var(--text-primary)]">Total Amount</span>
        <span className="text-2xl font-black text-[var(--brand-primary)]">{formatCurrency(order.total)}</span>
      </div>
      <div className="bg-[var(--surface-1)] rounded-xl p-3 text-[10px] text-[var(--text-tertiary)] uppercase font-black tracking-widest text-center">
        Payment via {order.razorpayPaymentId ? 'Razorpay' : 'Prepaid'}
      </div>
    </div>
  );
};

export const DeliveryAddressCard: React.FC<{ address: Order['address'] }> = ({ address }) => {
  return (
    <div className="bg-[var(--surface-0)] rounded-3xl p-6 border border-[var(--border-subtle)] shadow-sm">
      <h2 className="font-black text-xl text-[var(--text-primary)] mb-4 flex items-center gap-2">
        <MapPin className="w-6 h-6 text-[var(--brand-primary)]" />
        Delivery Details
      </h2>
      <div className="space-y-1">
        <p className="font-black text-[var(--text-primary)] text-lg mb-2">{address.label}</p>
        <p className="text-[var(--text-secondary)] font-medium leading-relaxed">
          {address.line1}
          {address.line2 && <span className="block italic">{address.line2}</span>}
          <span className="block text-[var(--text-primary)] font-bold mt-1">
            {address.city}, {address.state} - {address.pincode}
          </span>
        </p>
      </div>
    </div>
  );
};

export const TrackingCard: React.FC<{ tracking: Order['tracking'] }> = ({ tracking }) => {
  if (!tracking) return null;

  return (
    <div className="bg-[var(--surface-0)] border-2 border-[var(--brand-primary)] rounded-3xl p-6 shadow-lg shadow-[var(--brand-primary)]/10">
      <h2 className="font-black text-xl text-[var(--text-primary)] mb-4 flex items-center gap-2">
        <Truck className="w-6 h-6 text-[var(--brand-primary)]" />
        Live Tracking
      </h2>
      <div className="space-y-3">
        <div className="flex justify-between items-center text-sm">
          <span className="text-[var(--text-tertiary)] font-bold uppercase tracking-widest">Partner</span>
          <span className="font-black text-[var(--text-primary)]">{tracking.courier}</span>
        </div>
        <div className="flex justify-between items-center text-sm">
          <span className="text-[var(--text-tertiary)] font-bold uppercase tracking-widest">AWB ID</span>
          <span className="font-mono font-bold text-[var(--brand-primary)]">{tracking.trackingId}</span>
        </div>
        <a 
          href={tracking.trackingUrl} 
          target="_blank" 
          rel="noopener noreferrer"
          className="block w-full text-center py-3 bg-[var(--brand-primary)] text-white font-black rounded-2xl hover:bg-[var(--brand-primary)]/90 transition-all mt-4"
        >
          Track Shipment
        </a>
      </div>
    </div>
  );
};
