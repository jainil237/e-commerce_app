import '../../styles/policy.scss'

export default function CancellationPage() {
  return (
    <div className="ms-policy">
      <h1 className="ms-policy__title">Cancellation Policy</h1>
      <div className="ms-policy__card">
        <p>You can cancel your order at any time before the item has been dispatched from our warehouse.</p>

        <h2 className="ms-policy__h2">How to Cancel</h2>
        <p>To cancel an order, please visit your account dashboard, navigate to your orders, and select the &apos;Cancel Order&apos; option if available. Alternatively, you can contact our support team immediately.</p>

        <h2 className="ms-policy__h2">Post-Dispatch Cancellation</h2>
        <p>If your order has already been dispatched, cancellation is no longer possible. You will need to wait for the delivery and then initiate a return process following our Returns & Refunds policy.</p>
      </div>
    </div>
  )
}
