export default function PrivacyPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)] mb-8">Privacy Policy</h1>
      <div className="bg-[var(--surface-0)] shadow-sm border border-[var(--border-base)] rounded-xl p-8 space-y-6 text-[var(--text-secondary)]">
        <p>This Privacy Policy describes how your personal information is collected, used, and shared when you visit or make a purchase from our store.</p>
        
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mt-8 mb-4">Personal Information We Collect</h2>
        <p>When you visit the site, we automatically collect certain information about your device, including information about your web browser, IP address, time zone, and some of the cookies that are installed on your device.</p>
        
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mt-8 mb-4">How Do We Use Your Personal Information?</h2>
        <p>We use the Order Information that we collect generally to fulfill any orders placed through the Site (including processing your payment information, arranging for shipping, and providing you with invoices and/or order confirmations).</p>
      </div>
    </div>
  )
}
