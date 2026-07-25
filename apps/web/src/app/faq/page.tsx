import '../../styles/policy.scss'

export default function FAQPage() {
  return (
    <div className="ms-policy">
      <h1 className="ms-policy__title">Frequently Asked Questions</h1>
      <div className="ms-policy__card ms-policy__card--gap-lg">
        <div className="ms-policy__group">
          <h3 className="ms-policy__group-title">How long does shipping take?</h3>
          <p>
            Standard shipping typically takes 3-5 business days for metro cities, and up to 7 business days for the rest of the country.
          </p>
        </div>
        <div className="ms-policy__group">
          <h3 className="ms-policy__group-title">Do you offer free shipping?</h3>
          <p>
            Yes! We offer free shipping on all orders above ₹499. For orders below this amount, a flat rate of ₹49 applies.
          </p>
        </div>
        <div className="ms-policy__group">
          <h3 className="ms-policy__group-title">Can I return a product?</h3>
          <p>
            Absolutely. We have a 7-day hassle-free return policy for unused products in their original packaging.
          </p>
        </div>
      </div>
    </div>
  )
}
