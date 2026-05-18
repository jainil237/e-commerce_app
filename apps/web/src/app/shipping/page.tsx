export default function ShippingPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)] mb-8">Shipping Information</h1>
      <div className="bg-[var(--surface-0)] shadow-sm border border-[var(--border-base)] rounded-xl p-8 space-y-6">
        <p className="text-[var(--text-secondary)]">
          We strive to deliver your orders as quickly and safely as possible. We partner with top-tier courier services including Delhivery, Xpressbees, DTDC, and BlueDart.
        </p>
        
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mt-8 mb-4">Delivery Timelines</h2>
        <ul className="list-disc pl-5 text-[var(--text-secondary)] space-y-2">
          <li><strong>Metro Cities:</strong> 2-3 business days</li>
          <li><strong>Tier 2 Cities:</strong> 4-5 business days</li>
          <li><strong>Rest of India:</strong> Up to 7 business days</li>
        </ul>

        <h2 className="text-xl font-semibold text-[var(--text-primary)] mt-8 mb-4">Shipping Charges</h2>
        <ul className="list-disc pl-5 text-[var(--text-secondary)] space-y-2">
          <li><strong>Free Shipping:</strong> On all orders above ₹499</li>
          <li><strong>Standard Shipping:</strong> ₹49 for orders under ₹499</li>
        </ul>
      </div>
    </div>
  )
}
