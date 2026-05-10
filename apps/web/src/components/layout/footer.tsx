'use client'

import Link from 'next/link'
import { useStoreConfig } from '@/components/providers'

export function Footer() {
  const config = useStoreConfig()

  return (
    <footer className="hidden md:block bg-gray-900 text-white mt-auto">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Store Info */}
          <div>
            <h3 className="text-lg font-bold mb-4">{config.store.name}</h3>
            <p className="text-gray-400 text-sm mb-4">{config.store.tagline}</p>
            <div className="text-sm text-gray-400 space-y-1">
              <p>{config.store.contact.email}</p>
              <p>{config.store.contact.phone}</p>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-semibold mb-4">Quick Links</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link href="/products" className="hover:text-white">All Products</Link></li>
              <li><Link href="/orders" className="hover:text-white">Track Order</Link></li>
              <li><Link href="/account" className="hover:text-white">My Account</Link></li>
              <li><Link href="/wishlist" className="hover:text-white">Wishlist</Link></li>
            </ul>
          </div>

          {/* Customer Service */}
          <div>
            <h4 className="font-semibold mb-4">Customer Service</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link href="/contact" className="hover:text-white">Contact Us</Link></li>
              <li><Link href="/faq" className="hover:text-white">FAQ</Link></li>
              <li><Link href="/shipping" className="hover:text-white">Shipping Info</Link></li>
              <li><Link href="/returns" className="hover:text-white">Returns & Refunds</Link></li>
            </ul>
          </div>

          {/* Policies */}
          <div>
            <h4 className="font-semibold mb-4">Policies</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link href="/privacy" className="hover:text-white">Privacy Policy</Link></li>
              <li><Link href="/terms" className="hover:text-white">Terms of Service</Link></li>
              <li><Link href="/cancellation" className="hover:text-white">Cancellation Policy</Link></li>
            </ul>
          </div>
        </div>

        {/* Trust Row */}
        <div className="mt-12 pt-8 border-t border-gray-800">
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-gray-400">
            <span>🚚 Free delivery above ₹{config.shipping.freeShippingAbove}</span>
            <span>🔒 Secure Payments</span>
            <span>📄 GST Invoice</span>
            <span>↩️ Easy Returns</span>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-8 pt-8 border-t border-gray-800 text-center text-sm text-gray-500">
          <p>© {new Date().getFullYear()} {config.store.name}. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
