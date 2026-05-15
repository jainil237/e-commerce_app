'use client';

import React from 'react';
import { ArrowLeft, Download, Send, Phone, Mail, Loader2, Edit3, ShieldCheck } from 'lucide-react';
import { Order, ViewerContext } from '../../types';
import { SharedButton } from '../../components/UIPrimitives';
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

  return (
    <div className="min-h-screen bg-[var(--surface-1)]">
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

            <OrderItemsList items={order.items} />

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
    </div>
  );
};
