import '../../styles/policy.scss'

export default function ContactPage() {
  return (
    <div className="ms-policy">
      <h1 className="ms-policy__title">Contact Us</h1>
      <div className="ms-policy__card">
        <p>
          We would love to hear from you! For any questions or support, please reach out to our team.
        </p>
        <div className="ms-policy__group">
          <h3 className="ms-policy__group-title">Email</h3>
          <p>support@mystore.in</p>
        </div>
        <div className="ms-policy__group">
          <h3 className="ms-policy__group-title">Phone</h3>
          <p>+91-XXXXXXXXXX</p>
        </div>
        <div className="ms-policy__group">
          <h3 className="ms-policy__group-title">Working Hours</h3>
          <p>Monday - Friday: 9:00 AM to 6:00 PM</p>
        </div>
      </div>
    </div>
  )
}
