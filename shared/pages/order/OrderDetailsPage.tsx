'use client';

import React, { useState, useEffect } from 'react';
import { ArrowLeft, Download, Send, Phone, Mail, ShieldCheck, X, CheckCircle2, RotateCcw, RefreshCw, DollarSign, Truck } from 'lucide-react';
import clsx from 'clsx';
import { Order, OrderItem, ViewerContext } from '../../types';
import { SharedButton, SharedBadge } from '../../components/UIPrimitives';
import { FallbackImage } from '../../components/FallbackImage';
import { formatCurrency, formatDate } from '../../utils';
import {
  OrderHeader,
  OrderStatusTracker,
  OrderItemsList,
  OrderSummaryCard,
  DeliveryAddressCard,
  TrackingCard
} from './components';
import './order-details.scss';

interface OrderDetailsPageProps {
  order: Order;
  viewer: ViewerContext;
  onBack?: () => void;
  // Customer actions
  onDownloadInvoice?: () => void;
  onEmailInvoice?: () => void;
  isSendingInvoice?: boolean;
  // Admin actions
  onUpdateStatus?: (status: string) => void;
  onUpdateShipment?: (data: any) => void;
  onRefresh?: () => void;
}

export const OrderDetailsPage: React.FC<OrderDetailsPageProps> = ({
  order,
  viewer,
  onBack,
  onDownloadInvoice,
  onEmailInvoice,
  isSendingInvoice = false,
  onUpdateStatus,
  onUpdateShipment,
  onRefresh,
}) => {
  const isCustomer = viewer === 'customer';
  const isAdmin = viewer === 'admin';

  // Return and Replacement States
  const [actionStates, setActionStates] = useState<Record<string, { type: 'return' | 'replace'; status: string; reason: string; notes?: string; pickupShipment?: any }>>({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<OrderItem | null>(null);
  const [requestType, setRequestType] = useState<'return' | 'replace' | null>(null);
  const [reason, setReason] = useState('Wrong Size / Fit');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Load requested states from order.rmaRequests
  useEffect(() => {
    if (order.rmaRequests) {
      const newActionStates: Record<string, { type: 'return' | 'replace'; status: string; reason: string; notes?: string; pickupShipment?: any }> = {};
      order.rmaRequests.forEach((req: any) => {
        req.items.forEach((item: any) => {
          newActionStates[item.orderItemId] = {
            type: req.type.toLowerCase() as 'return' | 'replace',
            status: req.status,
            reason: req.reason,
            notes: req.customerNote || '',
            pickupShipment: req.pickupShipment,
          };
        });
      });
      setActionStates(newActionStates);
    }
  }, [order.rmaRequests]);


  const handleReturn = (item: OrderItem) => {
    setSelectedItem(item);
    setRequestType('return');
    setReason('Wrong Size / Fit');
    setNotes('');
    setShowSuccess(false);
    setValidationError(null);
    setIsModalOpen(true);
  };

  const handleReplace = (item: OrderItem) => {
    setSelectedItem(item);
    setRequestType('replace');
    setReason('Wrong Size / Fit');
    setNotes('');
    setShowSuccess(false);
    setValidationError(null);
    setIsModalOpen(true);
  };

  const handleSubmitRequest = async () => {
    setValidationError(null);
    if (!selectedItem) {
      setValidationError('Please select an item first.');
      return;
    }
    if (!requestType) {
      setValidationError('Please select a request type (Return or Replace).');
      return;
    }
    if (!reason || reason.trim() === '') {
      setValidationError('Please select a valid reason.');
      return;
    }
    if (reason === 'Other' && (!notes || notes.trim().length < 10)) {
      setValidationError('Additional comments/details are required (minimum 10 characters) when choosing "Other" as the reason.');
      return;
    }
    if (notes && notes.length > 300) {
      setValidationError('Additional comments cannot exceed 300 characters.');
      return;
    }

    setIsSubmitting(true);

    try {
      const apiType = requestType === 'return' ? 'RETURN' : 'REPLACEMENT';

      const REASON_MAPPING: Record<string, string> = {
        'Wrong Size / Fit': 'SIZE_ISSUE',
        'Damaged / Defective Product': 'DAMAGED',
        'Item not as described': 'NOT_AS_DESCRIBED',
        'Received wrong item': 'WRONG_ITEM',
        'Quality not up to expectations': 'QUALITY_ISSUE',
        'Other': 'OTHER'
      };

      const mappedReason = REASON_MAPPING[reason] || 'OTHER';

      const res = await fetch('/api/v1/rma/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          orderId: order.id,
          type: apiType,
          reason: mappedReason,
          customerNote: notes,
          items: [
            {
              orderItemId: selectedItem.id,
              quantity: selectedItem.quantity
            }
          ],
          images: [],
          refundDetails: requestType === 'return' ? {
            mode: 'ORIGINAL_PAYMENT_METHOD'
          } : undefined
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to submit request');
      }

      const newState = {
        ...actionStates,
        [selectedItem.id]: {
          type: requestType,
          status: 'PENDING',
          reason,
          notes,
        },
      };
      setActionStates(newState);
      setShowSuccess(true);

      // Close modal gracefully after success visual finishes
      setTimeout(() => {
        setIsModalOpen(false);
        setSelectedItem(null);
        setRequestType(null);
      }, 2000);
    } catch (e: any) {
      console.error(e);
      setValidationError(e.message || 'Failed to submit request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="ms-order">
      <div className="ms-order__container">
        {/* Navigation */}
        <button onClick={onBack} className="ms-order__back">
          <ArrowLeft className="w-4 h-4" />
          Back to list
        </button>

        <OrderHeader order={order} viewer={viewer} />

        <div className="ms-order__grid">
          {/* Main Content */}
          <div className="ms-order__main">
            <div className="ms-order__panel">
              <h2 className="ms-order__panel-title ms-order__panel-title--timeline">Order Timeline</h2>
              <div className="ms-order__timeline-inner">
                <OrderStatusTracker order={order} />
              </div>
            </div>

            {isAdmin && order.rmaRequests && order.rmaRequests.length > 0 && (
              <AdminRmaSection
                rmaRequests={order.rmaRequests}
                onRefresh={onRefresh}
                orderItems={order.items}
              />
            )}

            <OrderItemsList
              items={order.items}
              viewer={viewer}
              orderStatus={order.status}
              onReturn={handleReturn}
              onReplace={handleReplace}
              actionStates={actionStates}
            />

            <DeliveryAddressCard address={order.address} />

            {isAdmin && order.notes && (
              <div className="ms-order-note">
                <h2 className="ms-order-note__title">
                  <ShieldCheck className="ms-order-note__icon w-5 h-5" />
                  Order Notes (Internal)
                </h2>
                <p className="ms-order-note__text">{order.notes}</p>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="ms-order__sidebar">
            <OrderSummaryCard order={order} />

            {/* Actions Card */}
            <div className="ms-order__panel">
              <h2 className="ms-order__manage-title">Manage Order</h2>
              <div className="ms-order__manage-grid">
                {isCustomer && (
                  <>
                    <SharedButton
                      variant="primary"
                      className="w-full rounded-2xl h-14 text-sm font-black uppercase tracking-wider"
                      onClick={onDownloadInvoice}
                      disabled={order.paymentStatus !== 'PAID'}
                      leftIcon={<Download className="w-5 h-5" />}
                    >
                      Download Invoice
                    </SharedButton>
                    <SharedButton
                      variant="secondary"
                      className="w-full rounded-2xl h-14 text-sm font-black uppercase tracking-wider"
                      onClick={onEmailInvoice}
                      isLoading={isSendingInvoice}
                      disabled={order.paymentStatus !== 'PAID'}
                      leftIcon={<Send className="w-5 h-5" />}
                    >
                      Email Invoice
                    </SharedButton>
                    {order.paymentStatus !== 'PAID' && (
                      <p className="ms-order__hint">Available after payment</p>
                    )}
                  </>
                )}

                {isAdmin && (
                  <>
                    <div className="ms-order__field">
                      <label className="ms-order__field-label">Update Status</label>
                      <select
                        value={order.status}
                        onChange={(e) => onUpdateStatus?.(e.target.value)}
                        className="ms-order__select"
                        aria-label="Update Order Status"
                      >
                        <option value="PENDING">Pending</option>
                        <option value="PROCESSING">Processing</option>
                        <option value="SHIPPED">Shipped</option>
                        <option value="DELIVERED">Delivered</option>
                        <option value="CANCELLED">Cancelled</option>
                      </select>
                    </div>
                    <SharedButton
                      variant="secondary"
                      className="w-full rounded-2xl h-14 text-sm font-black uppercase tracking-wider"
                      onClick={() => onUpdateShipment?.(order)}
                    >
                      Update Shipment Info
                    </SharedButton>
                  </>
                )}
              </div>
            </div>

            <TrackingCard tracking={order.tracking} />

            {/* Contact Support */}
            <div className="ms-order-contact">
              <h2 className="ms-order-contact__title">Need Assistance?</h2>
              <div className="ms-order-contact__list">
                <a href="#" className="ms-order-contact__link">
                  <div className="ms-order-contact__icon-wrap">
                    <Phone className="w-4 h-4" />
                  </div>
                  Support Helpline
                </a>
                <a href="#" className="ms-order-contact__link">
                  <div className="ms-order-contact__icon-wrap">
                    <Mail className="w-4 h-4" />
                  </div>
                  Email Support
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Premium Glassmorphic Modal overlay */}
      {isModalOpen && selectedItem && requestType && (
        <div className="ms-order-modal">
          {/* Glass backdrop with high-end blur */}
          <div
            className="ms-order-modal__backdrop"
            onClick={() => !isSubmitting && !showSuccess && setIsModalOpen(false)}
          />

          {/* Modal Container */}
          <div className="ms-order-modal__card">
            {showSuccess ? (
              /* Success Anim Screen */
              <div className="ms-order-modal__success">
                <div className="ms-order-modal__success-icon">
                  <CheckCircle2 className="w-12 h-12 stroke-[3]" />
                </div>
                <h3 className="ms-order-modal__success-title">
                  Request Received
                </h3>
                <p className="ms-order-modal__success-text">
                  Your request for <strong>{selectedItem.product.name}</strong> has been logged successfully and will be processed shortly.
                </p>
              </div>
            ) : (
              /* Input Form Screen */
              <div className="flex flex-col">
                {/* Modal Header */}
                <div className="ms-order-modal__header">
                  <h3 className="ms-order-modal__title">
                    {requestType === 'return' ? (
                      <>
                        <RotateCcw className="w-5 h-5" style={{ color: 'var(--error)' }} />
                        Return Product
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-5 h-5" style={{ color: '#3b82f6' }} />
                        Replace Product
                      </>
                    )}
                  </h3>
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="ms-order-modal__close"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Modal Body */}
                <div className="ms-order-modal__body">
                  <div className="ms-order-modal__preview">
                    <div className="ms-order-modal__preview-media">
                      <FallbackImage src={selectedItem.product.images[0]?.url} alt={selectedItem.product.name} fill className="object-cover" />
                    </div>
                    <div className="ms-order-modal__preview-info">
                      <h4 className="ms-order-modal__preview-name">{selectedItem.product.name}</h4>
                      <p className="ms-order-modal__preview-meta">Qty: {selectedItem.quantity} | Total: {formatCurrency(selectedItem.subtotal)}</p>
                    </div>
                  </div>

                  {/* Select Reason */}
                  <div>
                    <label className="ms-order-modal__label">
                      Reason for {requestType}
                    </label>
                    <select
                      value={reason}
                      onChange={(e) => {
                        setReason(e.target.value);
                        setValidationError(null);
                      }}
                      className="ms-order-modal__select"
                    >
                      <option value="Wrong Size / Fit">Wrong Size / Fit</option>
                      <option value="Damaged / Defective Product">Damaged / Defective Product</option>
                      <option value="Item not as described">Item not as described</option>
                      <option value="Received wrong item">Received wrong item</option>
                      <option value="Quality not up to expectations">Quality not up to expectations</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  {/* Comments / Details */}
                  <div>
                    <label className="ms-order-modal__label">
                      Additional Details (Optional)
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => {
                        setNotes(e.target.value);
                        setValidationError(null);
                      }}
                      placeholder="Please share any relevant details to help us expedite your request..."
                      className="ms-order-modal__textarea"
                      maxLength={300}
                    />
                    <div className="ms-order-modal__char-count">
                      {notes.length}/300 chars
                    </div>
                  </div>

                  {/* Validation Error */}
                  {validationError && (
                    <div className="ms-order-modal__error">
                      {validationError}
                    </div>
                  )}
                </div>

                {/* Modal Footer */}
                <div className="ms-order-modal__footer">
                  <SharedButton
                    variant="ghost"
                    className="flex-1 rounded-xl font-bold text-sm h-12 uppercase"
                    onClick={() => setIsModalOpen(false)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </SharedButton>
                  <SharedButton
                    variant={requestType === 'return' ? 'danger' : 'primary'}
                    className="flex-1 rounded-xl font-black text-sm h-12 uppercase tracking-wide"
                    onClick={handleSubmitRequest}
                    isLoading={isSubmitting}
                  >
                    Confirm {requestType}
                  </SharedButton>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const AdminRmaSection: React.FC<{
  rmaRequests: any[];
  onRefresh?: () => void;
  orderItems: any[];
}> = ({ rmaRequests, onRefresh, orderItems }) => {
  const [activeAction, setActiveAction] = useState<{
    rmaId: string;
    rmaNumber: string;
    type: 'approve' | 'reject' | 'pickup' | 'receive' | 'refund' | 'ship';
  } | null>(null);

  const [adminNote, setAdminNote] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [courierPartner, setCourierPartner] = useState('');
  const [awbNumber, setAwbNumber] = useState('');
  const [restockItems, setRestockItems] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getItemDetails = (orderItemId: string) => {
    return orderItems.find((i) => i.id === orderItemId);
  };

  const handleExecuteAction = async () => {
    if (!activeAction) return;
    setError(null);
    setIsSubmitting(true);

    try {
      let url = '';
      let method = 'POST';
      let body: any = {};

      const { rmaId, type } = activeAction;

      if (type === 'approve') {
        url = `/api/v1/admin/rma/${rmaId}/approve`;
        method = 'PATCH';
        body = { adminNote };
      } else if (type === 'reject') {
        url = `/api/v1/admin/rma/${rmaId}/reject`;
        method = 'PATCH';
        body = { reason: rejectReason };
        if (rejectReason.trim().length < 5) {
          throw new Error('Rejection reason must be at least 5 characters long.');
        }
      } else if (type === 'pickup') {
        url = `/api/v1/admin/rma/${rmaId}/schedule-pickup`;
        body = { courierPartner, awbNumber };
        if (!courierPartner || courierPartner.trim().length < 2) {
          throw new Error('Courier Partner is required (minimum 2 characters).');
        }
        if (!awbNumber || awbNumber.trim().length < 5) {
          throw new Error('AWB/Tracking Number is required (minimum 5 characters).');
        }
      } else if (type === 'receive') {
        url = `/api/v1/admin/rma/${rmaId}/mark-received`;
        body = { restockItems };
      } else if (type === 'refund') {
        url = `/api/v1/admin/rma/${rmaId}/issue-refund`;
      } else if (type === 'ship') {
        url = `/api/v1/admin/rma/${rmaId}/ship-replacement`;
        body = { courierPartner, awbNumber };
        if (!courierPartner || courierPartner.trim().length < 2) {
          throw new Error('Courier Partner is required (minimum 2 characters).');
        }
        if (!awbNumber || awbNumber.trim().length < 5) {
          throw new Error('AWB/Tracking Number is required (minimum 5 characters).');
        }
      }

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: method === 'POST' || method === 'PATCH' ? JSON.stringify(body) : undefined,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Action failed');
      }

      setActiveAction(null);
      setAdminNote('');
      setRejectReason('');
      setCourierPartner('');
      setAwbNumber('');
      setRestockItems(true);

      onRefresh?.();
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'warning';
      case 'APPROVED':
        return 'info';
      case 'REJECTED':
        return 'error';
      case 'PICKUP_SCHEDULED':
        return 'info';
      case 'ITEM_RECEIVED':
        return 'neutral';
      case 'REFUND_INITIATED':
        return 'warning';
      case 'REFUND_COMPLETED':
      case 'REPLACEMENT_SHIPPED':
      case 'COMPLETED':
        return 'success';
      default:
        return 'neutral';
    }
  };

  return (
    <div className="ms-order-rma">
      <div className="ms-order-rma__head">
        <h2 className="ms-order-rma__title">
          <RotateCcw className="ms-order-rma__title-icon w-6 h-6" />
          RMA Requests ({rmaRequests.length})
        </h2>
        <span className="ms-order-rma__head-tag">
          Merchant Actions
        </span>
      </div>

      <div className="ms-order-rma__list">
        {rmaRequests.map((req) => (
          <div key={req.id} className="ms-order-rma__req">
            <div className="ms-order-rma__req-head">
              <div>
                <div className="ms-order-rma__req-id">
                  <span className="ms-order-rma__req-number">{req.rmaNumber}</span>
                  <SharedBadge variant={req.type === 'RETURN' ? 'error' : 'info'} className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider">
                    {req.type}
                  </SharedBadge>
                </div>
                <p className="ms-order-rma__req-date">Requested on {formatDate(req.createdAt)}</p>
              </div>
              <SharedBadge variant={getStatusColor(req.status)} className="px-3 py-1 font-black uppercase text-xs tracking-wider">
                {req.status.replace(/_/g, ' ')}
              </SharedBadge>
            </div>

            {/* Requested Items */}
            <div className="ms-order-rma__items">
              <p className="ms-order-rma__items-label">Requested Items</p>
              {req.items.map((item: any) => {
                const details = getItemDetails(item.orderItemId);
                if (!details) return null;
                return (
                  <div key={item.id} className="ms-order-rma__item-row">
                    <div className="ms-order-rma__item-media">
                      <FallbackImage src={details.product.images[0]?.url} alt={details.product.name} fill className="object-cover" />
                    </div>
                    <div className="min-w-0">
                      <p className="ms-order-rma__item-name">{details.product.name}</p>
                      <p className="ms-order-rma__item-qty">Quantity: {item.quantity}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Customer notes and reason */}
            <div className="ms-order-rma__meta">
              <div>
                <p className="ms-order-rma__meta-label">Reason for Request</p>
                <p className="ms-order-rma__meta-value">{req.reason.replace(/_/g, ' ')}</p>
              </div>
              {req.customerNote && (
                <div>
                  <p className="ms-order-rma__meta-label">Customer Note</p>
                  <p className="ms-order-rma__meta-note">"{req.customerNote}"</p>
                </div>
              )}
            </div>

            {/* Admin notes or log */}
            {req.adminNote && (
              <div className="ms-order-rma__admin-note">
                <p className="ms-order-rma__meta-label">Admin Comment</p>
                <p className="ms-order-rma__meta-value">{req.adminNote}</p>
              </div>
            )}

            {/* Action buttons section */}
            <div className="ms-order-rma__actions">
              {req.status === 'PENDING' && (
                <>
                  <SharedButton
                    variant="primary"
                    size="sm"
                    className="rounded-xl font-bold uppercase tracking-wider text-xs"
                    onClick={() => setActiveAction({ rmaId: req.id, rmaNumber: req.rmaNumber, type: 'approve' })}
                  >
                    Approve Request
                  </SharedButton>
                  <SharedButton
                    variant="danger"
                    size="sm"
                    className="rounded-xl font-bold uppercase tracking-wider text-xs"
                    onClick={() => setActiveAction({ rmaId: req.id, rmaNumber: req.rmaNumber, type: 'reject' })}
                  >
                    Reject Request
                  </SharedButton>
                </>
              )}

              {req.status === 'APPROVED' && (
                <SharedButton
                  variant="primary"
                  size="sm"
                  className="rounded-xl font-bold uppercase tracking-wider text-xs flex items-center gap-1.5"
                  onClick={() => setActiveAction({ rmaId: req.id, rmaNumber: req.rmaNumber, type: 'pickup' })}
                  leftIcon={<Truck className="w-3.5 h-3.5" />}
                >
                  Schedule Courier Pickup
                </SharedButton>
              )}

              {req.status === 'PICKUP_SCHEDULED' && (
                <>
                  <div className="ms-order-rma__shipinfo">
                    <div className="ms-order-rma__shipinfo-text">
                      <Truck className="ms-order-rma__shipinfo-icon w-4 h-4" />
                      <span>
                        Courier: <strong>{req.pickupShipment?.courierPartner}</strong> | AWB: <strong>{req.pickupShipment?.awbNumber}</strong>
                      </span>
                    </div>
                    {req.pickupShipment?.trackingUrl && (
                      <a
                        href={req.pickupShipment.trackingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ms-order-rma__shipinfo-link"
                      >
                        Track Shipment
                      </a>
                    )}
                  </div>
                  <SharedButton
                    variant="primary"
                    size="sm"
                    className="rounded-xl font-bold uppercase tracking-wider text-xs"
                    onClick={() => setActiveAction({ rmaId: req.id, rmaNumber: req.rmaNumber, type: 'receive' })}
                  >
                    Mark Item as Received
                  </SharedButton>
                </>
              )}

              {req.status === 'ITEM_RECEIVED' && (
                <>
                  {req.type === 'RETURN' ? (
                    <SharedButton
                      variant="primary"
                      size="sm"
                      className="rounded-xl font-bold uppercase tracking-wider text-xs flex items-center gap-1.5"
                      onClick={() => setActiveAction({ rmaId: req.id, rmaNumber: req.rmaNumber, type: 'refund' })}
                      leftIcon={<DollarSign className="w-3.5 h-3.5" />}
                    >
                      Issue Refund
                    </SharedButton>
                  ) : (
                    <SharedButton
                      variant="primary"
                      size="sm"
                      className="rounded-xl font-bold uppercase tracking-wider text-xs flex items-center gap-1.5"
                      onClick={() => setActiveAction({ rmaId: req.id, rmaNumber: req.rmaNumber, type: 'ship' })}
                      leftIcon={<Truck className="w-3.5 h-3.5" />}
                    >
                      Ship Replacement Item
                    </SharedButton>
                  )}
                </>
              )}

              {req.status === 'REPLACEMENT_SHIPPED' && req.replacementShipment && (
                <div className="ms-order-rma__shipinfo">
                  <div className="ms-order-rma__shipinfo-text">
                    <Truck className="ms-order-rma__shipinfo-icon w-4 h-4" />
                    <span>
                      Replacement Courier: <strong>{req.replacementShipment.courierPartner}</strong> | AWB: <strong>{req.replacementShipment.awbNumber}</strong>
                    </span>
                  </div>
                  {req.replacementShipment.trackingUrl && (
                    <a
                      href={req.replacementShipment.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ms-order-rma__shipinfo-link"
                    >
                      Track Shipment
                    </a>
                  )}
                </div>
              )}

              {req.status === 'REFUND_COMPLETED' && req.refund && (
                <div className="ms-order-rma__refundinfo">
                  Refund of <strong>{formatCurrency(req.refund.amount)}</strong> processed via <strong>{req.refund.mode.replace(/_/g, ' ')}</strong>.
                  {req.refund.paymentId && (
                    <span className="ms-order-rma__refundinfo-id">
                      Payment ID: <strong className="ms-order-rma__refundinfo-mono">{req.refund.paymentId}</strong>
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Admin Action Premium Modal Overlay */}
      {activeAction && (
        <div className="ms-order-modal">
          <div className="ms-order-modal__backdrop" onClick={() => !isSubmitting && setActiveAction(null)} />

          <div className="ms-order-modal__card">
            <div className="ms-order-modal__header">
              <h3 className="ms-order-modal__title">
                {activeAction.type.replace(/_/g, ' ')} RMA: {activeAction.rmaNumber}
              </h3>
              <button
                onClick={() => setActiveAction(null)}
                className="ms-order-modal__close"
                disabled={isSubmitting}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="ms-order-modal__body">
              {activeAction.type === 'approve' && (
                <div className="ms-order-modal__group">
                  <p className="ms-order-modal__text">
                    Approving this RMA request will notify the customer. You can optionally include an instruction or note for them below.
                  </p>
                  <div>
                    <label className="ms-order-modal__label">
                      Admin Note (Optional)
                    </label>
                    <textarea
                      value={adminNote}
                      onChange={(e) => setAdminNote(e.target.value)}
                      placeholder="e.g. Please hand over the item with its original tags and box to the pickup executive."
                      className="ms-order-modal__textarea"
                    />
                  </div>
                </div>
              )}

              {activeAction.type === 'reject' && (
                <div className="ms-order-modal__group">
                  <p className="ms-order-modal__text">
                    Please provide the reason for rejecting this return/replacement request. This reason will be shared with the customer.
                  </p>
                  <div>
                    <label className="ms-order-modal__label">
                      Rejection Reason <span className="ms-order-modal__req">*</span>
                    </label>
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Provide a detailed explanation (minimum 5 characters)..."
                      className="ms-order-modal__textarea"
                      required
                    />
                  </div>
                </div>
              )}

              {(activeAction.type === 'pickup' || activeAction.type === 'ship') && (
                <div className="ms-order-modal__group--lg">
                  <p className="ms-order-modal__text">
                    {activeAction.type === 'pickup'
                      ? 'Enter the reverse shipment courier details to schedule the pickup for the customer.'
                      : 'Enter the replacement package courier and AWB tracking details to complete this replacement request.'}
                  </p>
                  <div>
                    <label className="ms-order-modal__label">
                      Courier Partner <span className="ms-order-modal__req">*</span>
                    </label>
                    <input
                      type="text"
                      value={courierPartner}
                      onChange={(e) => setCourierPartner(e.target.value)}
                      placeholder="e.g. Delhivery, BlueDart, DTDC"
                      className="ms-order-modal__input"
                      required
                    />
                  </div>
                  <div>
                    <label className="ms-order-modal__label">
                      AWB / Tracking ID <span className="ms-order-modal__req">*</span>
                    </label>
                    <input
                      type="text"
                      value={awbNumber}
                      onChange={(e) => setAwbNumber(e.target.value)}
                      placeholder="Enter the shipment tracking number"
                      className="ms-order-modal__input"
                      required
                    />
                  </div>
                </div>
              )}

              {activeAction.type === 'receive' && (
                <div className="ms-order-modal__group--lg">
                  <p className="ms-order-modal__text">
                    Confirm that the returned package has arrived at the warehouse. You can choose whether to restock these items back into the live inventory.
                  </p>
                  <label className="ms-order-modal__check">
                    <input
                      type="checkbox"
                      checked={restockItems}
                      onChange={(e) => setRestockItems(e.target.checked)}
                      className="ms-order-modal__check-input"
                    />
                    <div>
                      <span className="ms-order-modal__check-title">Restock Returned Items</span>
                      <span className="ms-order-modal__check-hint">Increase product stock levels by the returned quantities.</span>
                    </div>
                  </label>
                </div>
              )}

              {activeAction.type === 'refund' && (
                <div className="ms-order-modal__group">
                  <div className="ms-order-modal__refund-icon">
                    <DollarSign className="w-8 h-8" />
                  </div>
                  <h4 className="ms-order-modal__refund-title">Issue Refund</h4>
                  <p className="ms-order-modal__refund-text">
                    Are you sure you want to process the refund for this return request? This will credit the amount back to the original payment method and finalize the RMA.
                  </p>
                </div>
              )}

              {error && (
                <div className="ms-order-modal__error">
                  {error}
                </div>
              )}
            </div>

            <div className="ms-order-modal__footer">
              <SharedButton
                variant="ghost"
                className="flex-1 rounded-xl font-bold text-sm h-12 uppercase"
                onClick={() => setActiveAction(null)}
                disabled={isSubmitting}
              >
                Cancel
              </SharedButton>
              <SharedButton
                variant={activeAction.type === 'reject' ? 'danger' : 'primary'}
                className="flex-1 rounded-xl font-black text-sm h-12 uppercase tracking-wide"
                onClick={handleExecuteAction}
                isLoading={isSubmitting}
              >
                Confirm
              </SharedButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
