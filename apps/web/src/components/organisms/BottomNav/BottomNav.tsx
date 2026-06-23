'use client'
import './bottom-nav.scss'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Search, ShoppingCart, User } from 'lucide-react'
import { useCart } from '@/contexts/cart.context'

export function BottomNav() {
  const pathname = usePathname()
  const { totalItems } = useCart()

  const navItems = [
    { href: '/', icon: Home, label: 'Home' },
    { href: '/products', icon: Search, label: 'Browse' },
    { href: '/cart', icon: ShoppingCart, label: 'Cart', badge: totalItems },
    { href: '/account', icon: User, label: 'Profile' },
  ]

  return (
    <nav className="ms-bottom-nav" aria-label="Mobile navigation">
      {navItems.map((item) => {
        const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
        const Icon = item.icon

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={`ms-bottom-nav__item${isActive ? ' ms-bottom-nav__item--active' : ''}`}
          >
            <div style={{ position: 'relative' }}>
              <Icon
                className="ms-bottom-nav__icon"
                strokeWidth={isActive ? 2.5 : 2}
                aria-hidden="true"
              />
              {item.badge !== undefined && item.badge > 0 && (
                <span className="ms-bottom-nav__badge" aria-hidden="true">{item.badge}</span>
              )}
            </div>
            <span className="ms-bottom-nav__label">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
