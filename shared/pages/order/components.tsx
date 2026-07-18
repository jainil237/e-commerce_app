'use client';

import React from 'react';
import { CheckCircle, Package, MapPin, Truck, RotateCcw, RefreshCw } from 'lucide-react';
import { FallbackImage } from '../../components/FallbackImage';
import { SharedBadge, SharedButton } from '../../components/UIPrimitives';
import { Order, OrderItem, ViewerContext } from '../../types';
import { formatCurrency, formatDate } from '../../utils';
import clsx from 'clsx';
import './order-details.scss';

const statusSteps = ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'];

export const OrderHeader: React.FC<{ order: Order; viewer: ViewerContext }> = ({ order, viewer }) => {
  return (
    <div className="ms-order-header">
      <div>
        <h1 className="ms-order-header__title">Order #{order.orderNumber}</h1>
        <p className="ms-order-header__date">Placed on {formatDate(order.createdAt)}</p>
      </div>
      <div className="ms-order-header__meta">
        <SharedBadge variant={order.paymentStatus === 'PAID' ? 'success' : 'warning'} className="px-4 py-1 text-sm font-bold tracking-wider">
          {order.paymentStatus}
        </SharedBadge>

        {viewer === 'admin' && order.user && (
          <div className="ms-order-header__customer">
            <p className="ms-order-header__customer-label">Customer</p>
            <a href={`/customers/${order.user.id}`} className="ms-order-header__customer-link">
              <span className="ms-order-header__customer-name">{order.user.name}</span>
              <span className="ms-order-header__customer-contact">{order.user.email}</span>
              <span className="ms-order-header__customer-contact">{order.user.phone}</span>
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
      <div className="ms-order-tracker--cancelled">
        <CheckCircle className="w-6 h-6 rotate-45" />
        <span>This order has been cancelled</span>
      </div>
    );
  }

  return (
    <div className="ms-order-tracker">
      {statusSteps.map((step, index) => {
        const isCompleted = index <= currentStepIndex;
        const isCurrent = index === currentStepIndex;
        return (
          <div key={step} className="ms-order-tracker__step">
            {index < statusSteps.length - 1 && (
              <div className={clsx('ms-order-tracker__line', index < currentStepIndex && 'ms-order-tracker__line--done')} />
            )}

            <div className={clsx('ms-order-tracker__dot', isCompleted && 'ms-order-tracker__dot--done', isCurrent && 'ms-order-tracker__dot--current')}>
              {isCompleted ? <CheckCircle className="w-6 h-6" /> : <span>{index + 1}</span>}
            </div>
            <p className={clsx('ms-order-tracker__label', isCompleted && 'ms-order-tracker__label--done')}>
              {index === 0 && order.status === 'PENDING' ? 'PENDING' : step}
            </p>
          </div>
        );
      })}
    </div>
  );
};

export const OrderItemsList: React.FC<{
  items: OrderItem[];
  viewer?: ViewerContext;
  orderStatus?: string;
  onReturn?: (item: OrderItem) => void;
  onReplace?: (item: OrderItem) => void;
  actionStates?: Record<string, { type: 'return' | 'replace'; status: string; reason: string; pickupShipment?: any }>;
}> = ({ items, viewer = 'customer', orderStatus, onReturn, onReplace, actionStates = {} }) => {
  return (
    <div className="ms-order-items">
      <h2 className="ms-order-items__title">
        <Package className="ms-order-items__title-icon w-6 h-6" />
        Items ({items.length})
      </h2>
      <div className="ms-order-items__list">
        {items.map((item) => (
          <div key={item.id} className="ms-order-items__item">
            <div className="ms-order-items__main">
              <div className="ms-order-items__media">
                <FallbackImage src={item.product.images[0]?.url} alt={item.product.name} fill className="object-cover" />
              </div>
              <div className="ms-order-items__info">
                <h3 className="ms-order-items__name">{item.product.name}</h3>
                <div className="ms-order-items__meta">
                  <span>Qty: <span className="ms-order-items__meta-strong">{item.quantity}</span></span>
                  <span>Price: <span className="ms-order-items__meta-strong">{formatCurrency(item.unitPrice)}</span></span>
                </div>
                <p className="ms-order-items__gst">GST: {item.gstPercent}% Included</p>
              </div>
            </div>

            <div className="ms-order-items__side">
              <div>
                <p className="ms-order-items__subtotal">{formatCurrency(item.subtotal)}</p>
              </div>

              {/* Return / Replace buttons */}
              {viewer === 'customer' && orderStatus === 'DELIVERED' && (
                <div className="ms-order-items__actions">
                  {actionStates[item.id] ? (
                    <div className="ms-order-items__rma-state">
                      <SharedBadge variant={actionStates[item.id].type === 'return' ? 'error' : 'info'} className="font-black px-3 py-1 uppercase tracking-wider text-xs">
                        {actionStates[item.id].type === 'return' ? 'Return Requested' : 'Replacement Requested'}
                      </SharedBadge>
                      <span className="ms-order-items__rma-reason">
                        Reason: {actionStates[item.id].reason}
                      </span>
                      {actionStates[item.id].status === 'PICKUP_SCHEDULED' && actionStates[item.id].pickupShipment?.trackingUrl && (
                        <a
                          href={actionStates[item.id].pickupShipment.trackingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ms-order-items__rma-track"
                        >
                          <Truck className="w-3 h-3" /> Track Pickup
                        </a>
                      )}
                    </div>
                  ) : (
                    <>
                      {item.product.isReturnable !== false && (
                        <SharedButton
                          variant="danger"
                          size="sm"
                          className="rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm"
                          onClick={() => onReturn?.(item)}
                          leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
                        >
                          Return Item
                        </SharedButton>
                      )}
                      {item.product.isReplaceable !== false && (
                        <SharedButton
                          variant="secondary"
                          size="sm"
                          className="rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm"
                          onClick={() => onReplace?.(item)}
                          leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                        >
                          Replace Item
                        </SharedButton>
                      )}
                      {item.product.isReturnable === false && item.product.isReplaceable === false && (
                        <span className="ms-order-items__nonreturnable">Non-returnable & non-replaceable</span>
                      )}
                    </>
                  )}
                </div>
              )}

              {viewer === 'admin' && actionStates[item.id] && (
                <div className="ms-order-items__rma-state">
                  <SharedBadge variant={actionStates[item.id].type === 'return' ? 'error' : 'info'} className="font-black px-3 py-1 uppercase tracking-wider text-xs">
                    {actionStates[item.id].type === 'return' ? 'Return Requested' : 'Replacement Requested'}
                  </SharedBadge>
                  <span className="ms-order-items__rma-reason ms-order-items__rma-reason--admin">
                    Reason: {actionStates[item.id].reason}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const OrderSummaryCard: React.FC<{ order: Order }> = ({ order }) => {
  return (
    <div className="ms-order-summary">
      <h2 className="ms-order-summary__title">Order Summary</h2>
      <div className="ms-order-summary__rows">
        <div className="ms-order-summary__row">
          <span>Subtotal</span>
          <span className="ms-order-summary__value">{formatCurrency(order.subtotal)}</span>
        </div>
        <div className="ms-order-summary__row">
          <span>Shipping</span>
          <span className={Number(order.shippingCharge) === 0 ? 'ms-order-summary__value--free' : 'ms-order-summary__value'}>
            {Number(order.shippingCharge) === 0 ? 'FREE' : formatCurrency(order.shippingCharge)}
          </span>
        </div>
        {Number(order.discount) > 0 && (
          <div className="ms-order-summary__row ms-order-summary__row--discount">
            <span>Discount</span>
            <span>-{formatCurrency(order.discount)}</span>
          </div>
        )}
        <div className="ms-order-summary__row ms-order-summary__row--tax">
          <span>Taxes (GST)</span>
          <span className="ms-order-summary__value">{formatCurrency(order.gstAmount)}</span>
        </div>
      </div>
      <div className="ms-order-summary__total">
        <span className="ms-order-summary__total-label">Total Amount</span>
        <span className="ms-order-summary__total-value">{formatCurrency(order.total)}</span>
      </div>
      <div className="ms-order-summary__payment">
        Payment via {order.razorpayPaymentId ? 'Razorpay' : 'Prepaid'}
      </div>
    </div>
  );
};

export const DeliveryAddressCard: React.FC<{ address: Order['address'] }> = ({ address }) => {
  return (
    <div className="ms-order-address">
      <h2 className="ms-order-address__title">
        <MapPin className="ms-order-address__icon w-6 h-6" />
        Delivery Details
      </h2>
      <div>
        <p className="ms-order-address__label">{address.label}</p>
        <p className="ms-order-address__text">
          {address.line1}
          {address.line2 && <span className="ms-order-address__line2">{address.line2}</span>}
          <span className="ms-order-address__loc">
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
    <div className="ms-order-tracking">
      <h2 className="ms-order-tracking__title">
        <Truck className="ms-order-tracking__icon w-6 h-6" />
        Live Tracking
      </h2>
      <div className="ms-order-tracking__rows">
        <div className="ms-order-tracking__row">
          <span className="ms-order-tracking__row-label">Partner</span>
          <span className="ms-order-tracking__row-value">{tracking.courier}</span>
        </div>
        <div className="ms-order-tracking__row">
          <span className="ms-order-tracking__row-label">AWB ID</span>
          <span className="ms-order-tracking__awb">{tracking.trackingId}</span>
        </div>
        <a
          href={tracking.trackingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ms-order-tracking__cta"
        >
          Track Shipment
        </a>
      </div>
    </div>
  );
};
