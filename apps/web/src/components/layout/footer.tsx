'use client'
import './footer.scss'

import Link from 'next/link'
import { useStoreConfig } from '@/contexts/store-config.context'

export function Footer() {
  const config = useStoreConfig()

  return (
    <footer className="ms-footer">
      <div className="ms-footer__inner">
        <div className="ms-footer__grid">
          <div>
            <h3 className="ms-footer__col-title">{config.store.name}</h3>
            <p className="ms-footer__col-subtitle">{config.store.tagline}</p>
            <div className="ms-footer__contact">
              <span>{config.store.contact.email}</span>
              <span>{config.store.contact.phone}</span>
            </div>
          </div>

          <div>
            <h4 className="ms-footer__nav-heading">Quick Links</h4>
            <ul className="ms-footer__nav-list">
              <li><Link href="/products" className="ms-footer__nav-link">All Products</Link></li>
              <li><Link href="/orders" className="ms-footer__nav-link">Track Order</Link></li>
              <li><Link href="/account" className="ms-footer__nav-link">My Account</Link></li>
              <li><Link href="/wishlist" className="ms-footer__nav-link">Wishlist</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="ms-footer__nav-heading">Customer Service</h4>
            <ul className="ms-footer__nav-list">
              <li><Link href="/contact" className="ms-footer__nav-link">Contact Us</Link></li>
              <li><Link href="/faq" className="ms-footer__nav-link">FAQ</Link></li>
              <li><Link href="/shipping" className="ms-footer__nav-link">Shipping Info</Link></li>
              <li><Link href="/returns" className="ms-footer__nav-link">Returns &amp; Refunds</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="ms-footer__nav-heading">Policies</h4>
            <ul className="ms-footer__nav-list">
              <li><Link href="/privacy" className="ms-footer__nav-link">Privacy Policy</Link></li>
              <li><Link href="/terms" className="ms-footer__nav-link">Terms of Service</Link></li>
              <li><Link href="/cancellation" className="ms-footer__nav-link">Cancellation Policy</Link></li>
            </ul>
          </div>
        </div>

        <div className="ms-footer__trust">
          <span className="ms-footer__trust-item">🚚 Free delivery above ₹{config.shipping.freeShippingAbove}</span>
          <span className="ms-footer__trust-item">🔒 Secure Payments</span>
          <span className="ms-footer__trust-item">📄 GST Invoice</span>
          <span className="ms-footer__trust-item">↩️ Easy Returns</span>
        </div>

        <div className="ms-footer__bottom">
          <p>© {new Date().getFullYear()} {config.store.name}. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
