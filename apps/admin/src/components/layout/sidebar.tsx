'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  Tags,
  Settings,
  LogOut,
  Sun,
  Moon,
  X,
} from 'lucide-react'
import clsx from 'clsx'
import { useAuth, useTheme } from '@/components/providers'
import { getFirstLetter } from '@/utils/initials'
import { ClerkAuthControls } from '@/components/ClerkAuthControls'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Products', href: '/products', icon: Package },
  { name: 'Orders', href: '/orders', icon: ShoppingCart },
  { name: 'Customers', href: '/customers', icon: Users },
  { name: 'Coupons', href: '/coupons', icon: Tags },
  { name: 'Settings', href: '/settings', icon: Settings },
]

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="ms-sidebar">
      <div className="ms-sidebar__brand">
        <div className="ms-sidebar__brand-text">
          Admin Panel
          <span className="ms-sidebar__sub">Store management</span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="ms-sidebar__close"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <nav className="ms-sidebar__nav" aria-label="Main">
        {navigation.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={onClose}
              className={clsx('ms-sidebar__link', isActive && 'ms-sidebar__link--active')}
            >
              <item.icon className="w-5 h-5" />
              <span>{item.name}</span>
            </Link>
          )
        })}
      </nav>

      <div className="ms-sidebar__footer">
        <div className="ms-sidebar__user">
          <div className="ms-sidebar__avatar">{getFirstLetter(user?.name)}</div>
          <div className="ms-sidebar__user-info">
            <p className="ms-sidebar__user-name">{user?.name}</p>
            <p className="ms-sidebar__user-email">{user?.email}</p>
          </div>
        </div>

        <button type="button" onClick={toggleTheme} className="ms-sidebar__link">
          {theme === 'light' ? (
            <>
              <Moon className="w-4 h-4" />
              <span>Dark Mode</span>
            </>
          ) : (
            <>
              <Sun className="w-4 h-4" />
              <span>Light Mode</span>
            </>
          )}
        </button>

        <div className="ms-sidebar__link" style={{ pointerEvents: 'auto' }}>
          <ClerkAuthControls />
        </div>

        <button type="button" onClick={logout} className="ms-sidebar__link">
          <LogOut className="w-4 h-4" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  )
}
