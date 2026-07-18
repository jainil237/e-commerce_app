import '../../styles/policy.scss'

export default function ShippingPage() {
  return (
    <div className="ms-policy">
      <h1 className="ms-policy__title">Shipping Information</h1>
      <div className="ms-policy__card">
        <p>
          We strive to deliver your orders as quickly and safely as possible. We partner with top-tier courier services including Delhivery, Xpressbees, DTDC, and BlueDart.
        </p>

        <h2 className="ms-policy__h2">Delivery Timelines</h2>
        <ul className="ms-policy__list">
          <li><strong>Metro Cities:</strong> 2-3 business days</li>
          <li><strong>Tier 2 Cities:</strong> 4-5 business days</li>
          <li><strong>Rest of India:</strong> Up to 7 business days</li>
        </ul>

        <h2 className="ms-policy__h2">Shipping Charges</h2>
        <ul className="ms-policy__list">
          <li><strong>Free Shipping:</strong> On all orders above ₹499</li>
          <li><strong>Standard Shipping:</strong> ₹49 for orders under ₹499</li>
        </ul>
      </div>
    </div>
  )
}
