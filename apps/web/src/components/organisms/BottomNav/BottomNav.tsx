'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Search, ShoppingCart, User } from 'lucide-react'
import { useCart } from '@/components/providers'

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
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-[var(--surface-glass)] backdrop-blur-xl border-t border-[var(--border-subtle)] pb-[env(safe-area-inset-bottom)]" aria-label="Mobile Bottom Navigation">
      <div className="flex justify-around items-center h-16 px-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center w-full h-full min-w-[64px] min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded-xl transition-colors ${isActive ? 'text-[var(--brand-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)]'}`}
            >
              {isActive && <div className="absolute top-0 w-8 h-1 bg-[var(--brand-primary)] rounded-b-full transition-all" />}
              <div className="relative mt-1">
                <Icon className={`w-6 h-6 ${isActive ? 'scale-110' : ''} transition-transform`} strokeWidth={isActive ? 2.5 : 2} aria-hidden="true" />
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute -top-1 -right-2 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-[var(--surface-0)]">{item.badge}</span>
                )}
              </div>
              <span className={`text-[10px] font-medium mt-1 ${isActive ? 'font-bold' : ''}`}>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
