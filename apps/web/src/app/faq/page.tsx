export default function FAQPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)] mb-8">Frequently Asked Questions</h1>
      <div className="bg-[var(--surface-0)] shadow-sm border border-[var(--border-base)] rounded-xl p-8 space-y-8">
        <div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">How long does shipping take?</h3>
          <p className="text-[var(--text-secondary)]">
            Standard shipping typically takes 3-5 business days for metro cities, and up to 7 business days for the rest of the country.
          </p>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Do you offer free shipping?</h3>
          <p className="text-[var(--text-secondary)]">
            Yes! We offer free shipping on all orders above ₹499. For orders below this amount, a flat rate of ₹49 applies.
          </p>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Can I return a product?</h3>
          <p className="text-[var(--text-secondary)]">
            Absolutely. We have a 7-day hassle-free return policy for unused products in their original packaging.
          </p>
        </div>
      </div>
    </div>
  )
}
