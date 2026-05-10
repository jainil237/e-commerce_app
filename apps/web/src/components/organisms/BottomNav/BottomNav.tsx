'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Search, ShoppingCart, User } from 'lucide-react'
import { useCart } from '@/components/providers'
import styles from './BottomNav.module.css'

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
    <nav className={styles.nav}>
      <div className={styles.container}>
        {navItems.map((item) => {
          const isActive = pathname === item.href
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.link} ${isActive ? styles.linkActive : ''}`}
            >
              {isActive && <div className={styles.activeIndicator} />}
              <div className={styles.iconWrapper}>
                <Icon className={styles.icon} strokeWidth={isActive ? 2.5 : 2} />
                {item.badge !== undefined && item.badge > 0 && (
                  <span className={styles.badge}>{item.badge}</span>
                )}
              </div>
              <span className={styles.label}>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
