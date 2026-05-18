export default function ContactPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)] mb-8">Contact Us</h1>
      <div className="bg-[var(--surface-0)] shadow-sm border border-[var(--border-base)] rounded-xl p-8">
        <p className="text-[var(--text-secondary)] mb-6">
          We would love to hear from you! For any questions or support, please reach out to our team.
        </p>
        <div className="space-y-6">
          <div>
            <h3 className="font-semibold text-lg text-[var(--text-primary)]">Email</h3>
            <p className="text-[var(--text-secondary)] mt-1">support@mystore.in</p>
          </div>
          <div>
            <h3 className="font-semibold text-lg text-[var(--text-primary)]">Phone</h3>
            <p className="text-[var(--text-secondary)] mt-1">+91-XXXXXXXXXX</p>
          </div>
          <div>
            <h3 className="font-semibold text-lg text-[var(--text-primary)]">Working Hours</h3>
            <p className="text-[var(--text-secondary)] mt-1">Monday - Friday: 9:00 AM to 6:00 PM</p>
          </div>
        </div>
      </div>
    </div>
  )
}
