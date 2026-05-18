export default function ReturnsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)] mb-8">Returns & Refunds</h1>
      <div className="bg-[var(--surface-0)] shadow-sm border border-[var(--border-base)] rounded-xl p-8 space-y-6 text-[var(--text-secondary)]">
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">Returns Policy</h2>
        <p>We accept returns within 7 days of delivery for most items. To be eligible for a return, your item must be unused and in the same condition that you received it. It must also be in the original packaging.</p>
        
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mt-8 mb-4">Refunds</h2>
        <p>Once your return is received and inspected, we will send you an email to notify you that we have received your returned item. If approved, your refund will be processed, and a credit will automatically be applied to your credit card or original method of payment, within 5-7 business days.</p>
      </div>
    </div>
  )
}
