'use client';

import React, { useState, useEffect } from 'react';
import { ArrowLeft, Download, Send, Phone, Mail, Loader2, Edit3, ShieldCheck, X, CheckCircle2, RotateCcw, RefreshCw } from 'lucide-react';
import { Order, OrderItem, ViewerContext } from '../../types';
import { SharedButton, SharedBadge } from '../../components/UIPrimitives';
import { FallbackImage } from '../../components/FallbackImage';
import { formatCurrency } from '../../utils';
import { 
  OrderHeader, 
  OrderStatusTracker, 
  OrderItemsList, 
  OrderSummaryCard, 
  DeliveryAddressCard, 
  TrackingCard 
} from './components';

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
}) => {
  const isCustomer = viewer === 'customer';
  const isAdmin = viewer === 'admin';

  // Return and Replacement States
  const [actionStates, setActionStates] = useState<Record<string, { type: 'return' | 'replace'; status: string; reason: string; notes?: string }>>({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<OrderItem | null>(null);
  const [requestType, setRequestType] = useState<'return' | 'replace' | null>(null);
  const [reason, setReason] = useState('Wrong Size / Fit');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Load requested states from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(`order_returns_${order.id}`);
      if (stored) {
        try {
          setActionStates(JSON.parse(stored));
        } catch (e) {
          console.error('Error parsing stored action states', e);
        }
      }
    }
  }, [order.id]);

  // Save request state helper
  const saveActionState = (itemId: string, type: 'return' | 'replace', reason: string, notes: string) => {
    const newState = {
      ...actionStates,
      [itemId]: {
        type,
        status: 'PENDING',
        reason,
        notes,
      },
    };
    setActionStates(newState);
    if (typeof window !== 'undefined') {
      localStorage.setItem(`order_returns_${order.id}`, JSON.stringify(newState));
    }
  };

  const handleReturn = (item: OrderItem) => {
    setSelectedItem(item);
    setRequestType('return');
    setReason('Wrong Size / Fit');
    setNotes('');
    setShowSuccess(false);
    setIsModalOpen(true);
  };

  const handleReplace = (item: OrderItem) => {
    setSelectedItem(item);
    setRequestType('replace');
    setReason('Wrong Size / Fit');
    setNotes('');
    setShowSuccess(false);
    setIsModalOpen(true);
  };

  const handleSubmitRequest = () => {
    if (!selectedItem || !requestType) return;
    setIsSubmitting(true);
    
    // Simulate premium visual delay for API request execution
    setTimeout(() => {
      saveActionState(selectedItem.id, requestType, reason, notes);
      setIsSubmitting(false);
      setShowSuccess(true);
      
      // Close modal gracefully after success visual finishes
      setTimeout(() => {
        setIsModalOpen(false);
        setSelectedItem(null);
        setRequestType(null);
      }, 2000);
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-[var(--surface-1)] relative">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8">
        {/* Navigation */}
        <button 
          onClick={onBack} 
          className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-8 transition-all font-bold uppercase tracking-widest text-xs"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to list
        </button>

        <OrderHeader order={order} viewer={viewer} />

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-[var(--surface-0)] rounded-3xl p-8 border border-[var(--border-subtle)] shadow-sm">
              <h2 className="font-black text-xl text-[var(--text-primary)] mb-10">Order Timeline</h2>
              <div className="px-4">
                <OrderStatusTracker order={order} />
              </div>
            </div>

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
              <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/20 rounded-3xl p-6">
                <h2 className="font-bold text-[var(--text-primary)] mb-2 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-blue-500" />
                  Order Notes (Internal)
                </h2>
                <p className="text-sm text-[var(--text-secondary)]">{order.notes}</p>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <OrderSummaryCard order={order} />

            {/* Actions Card */}
            <div className="bg-[var(--surface-0)] rounded-3xl p-8 border border-[var(--border-subtle)] shadow-sm">
              <h2 className="font-black text-lg text-[var(--text-primary)] mb-6">Manage Order</h2>
              <div className="grid grid-cols-1 gap-4">
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
                      <p className="text-[10px] text-center text-[var(--text-tertiary)] uppercase font-black mt-2 tracking-widest">Available after payment</p>
                    )}
                  </>
                )}

                {isAdmin && (
                  <>
                    <SharedButton
                      variant="primary"
                      className="w-full rounded-2xl h-14 text-sm font-black uppercase tracking-wider"
                      onClick={() => onUpdateStatus?.('PROCESSING')}
                      leftIcon={<Edit3 className="w-5 h-5" />}
                    >
                      Update Order Status
                    </SharedButton>
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
            <div className="bg-[var(--surface-2)] rounded-3xl p-6 border border-[var(--border-subtle)]">
              <h2 className="font-bold text-[var(--text-primary)] mb-4">Need Assistance?</h2>
              <div className="space-y-3">
                <a href="#" className="flex items-center gap-3 text-sm text-[var(--text-secondary)] hover:text-[var(--brand-primary)] transition-colors">
                  <div className="w-8 h-8 bg-[var(--surface-1)] rounded-full flex items-center justify-center">
                    <Phone className="w-4 h-4" />
                  </div>
                  Support Helpline
                </a>
                <a href="#" className="flex items-center gap-3 text-sm text-[var(--text-secondary)] hover:text-[var(--brand-primary)] transition-colors">
                  <div className="w-8 h-8 bg-[var(--surface-1)] rounded-full flex items-center justify-center">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Glass backdrop with high-end blur */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity duration-300"
            onClick={() => !isSubmitting && !showSuccess && setIsModalOpen(false)}
          />
          
          {/* Modal Container */}
          <div className="relative w-full max-w-lg bg-[var(--surface-0)] border border-[var(--border-subtle)] rounded-3xl overflow-hidden shadow-2xl z-10 transition-all duration-300 transform scale-100">
            {showSuccess ? (
              /* Success Anim Screen */
              <div className="p-8 text-center flex flex-col items-center justify-center min-h-[350px] animate-pulse">
                <div className="w-20 h-20 bg-green-500/10 dark:bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mb-6">
                  <CheckCircle2 className="w-12 h-12 stroke-[3]" />
                </div>
                <h3 className="text-2xl font-black text-[var(--text-primary)] mb-2 uppercase tracking-wide">
                  Request Received
                </h3>
                <p className="text-sm text-[var(--text-secondary)] max-w-sm">
                  Your request for <strong className="text-[var(--text-primary)]">{selectedItem.product.name}</strong> has been logged successfully and will be processed shortly.
                </p>
              </div>
            ) : (
              /* Input Form Screen */
              <div className="flex flex-col">
                {/* Modal Header */}
                <div className="flex items-center justify-between p-6 border-b border-[var(--border-subtle)] bg-[var(--surface-1)]">
                  <h3 className="text-lg font-black text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                    {requestType === 'return' ? (
                      <>
                        <RotateCcw className="w-5 h-5 text-red-500" />
                        Return Product
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-5 h-5 text-blue-500" />
                        Replace Product
                      </>
                    )}
                  </h3>
                  <button 
                    onClick={() => setIsModalOpen(false)}
                    className="p-1 rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                {/* Modal Body */}
                <div className="p-6 space-y-5">
                  <div className="flex gap-4 p-3 bg-[var(--surface-1)] rounded-2xl border border-[var(--border-subtle)]">
                    <div className="relative w-16 h-16 bg-[var(--surface-0)] rounded-xl overflow-hidden flex-shrink-0 border border-[var(--border-subtle)]">
                      <FallbackImage src={selectedItem.product.images[0]?.url} alt={selectedItem.product.name} fill className="object-cover" />
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <h4 className="font-bold text-sm text-[var(--text-primary)] truncate">{selectedItem.product.name}</h4>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5">Qty: {selectedItem.quantity} | Total: {formatCurrency(selectedItem.subtotal)}</p>
                    </div>
                  </div>
                  
                  {/* Select Reason */}
                  <div>
                    <label className="block text-xs font-black uppercase text-[var(--text-secondary)] tracking-wider mb-2">
                      Reason for {requestType}
                    </label>
                    <select
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="w-full h-12 px-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-0)] text-[var(--text-primary)] font-bold text-sm focus:border-[var(--brand-primary)] focus:outline-none transition-colors"
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
                    <label className="block text-xs font-black uppercase text-[var(--text-secondary)] tracking-wider mb-2">
                      Additional Details (Optional)
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Please share any relevant details to help us expedite your request..."
                      className="w-full p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-0)] text-[var(--text-primary)] font-semibold text-sm h-28 focus:border-[var(--brand-primary)] focus:outline-none transition-colors resize-none"
                      maxLength={300}
                    />
                    <div className="text-right text-[10px] text-[var(--text-tertiary)] font-bold mt-1">
                      {notes.length}/300 chars
                    </div>
                  </div>
                </div>
                
                {/* Modal Footer */}
                <div className="flex gap-3 p-6 border-t border-[var(--border-subtle)] bg-[var(--surface-1)]">
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
