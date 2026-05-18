export default function CancellationPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)] mb-8">Cancellation Policy</h1>
      <div className="bg-[var(--surface-0)] shadow-sm border border-[var(--border-base)] rounded-xl p-8 space-y-6 text-[var(--text-secondary)]">
        <p>You can cancel your order at any time before the item has been dispatched from our warehouse.</p>
        
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mt-8 mb-4">How to Cancel</h2>
        <p>To cancel an order, please visit your account dashboard, navigate to your orders, and select the 'Cancel Order' option if available. Alternatively, you can contact our support team immediately.</p>
        
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mt-8 mb-4">Post-Dispatch Cancellation</h2>
        <p>If your order has already been dispatched, cancellation is no longer possible. You will need to wait for the delivery and then initiate a return process following our Returns & Refunds policy.</p>
      </div>
    </div>
  )
}
