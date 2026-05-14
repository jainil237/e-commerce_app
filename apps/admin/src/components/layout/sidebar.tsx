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
  Store,
  Sun,
  Moon,
} from 'lucide-react'
import { useAuth, useTheme } from '@/components/providers'
import { getFirstLetter } from '@/utils/initials'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Products', href: '/products', icon: Package },
  { name: 'Orders', href: '/orders', icon: ShoppingCart },
  { name: 'Customers', href: '/customers', icon: Users },
  { name: 'Coupons', href: '/coupons', icon: Tags },
  { name: 'Settings', href: '/settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="sidebar flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-2 px-6 py-8">
        <div className="p-2 bg-blue-600 rounded-xl shadow-lg shadow-blue-500/20">
          <Store className="w-6 h-6 text-white" />
        </div>
        <span className="text-xl font-bold tracking-tight">Admin Panel</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href || 
            (item.href !== '/' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`sidebar-link ${isActive ? 'active' : ''}`}
            >
              <item.icon className="w-5 h-5" />
              <span className="font-medium">{item.name}</span>
            </Link>
          )
        })}
      </nav>

      {/* User section */}
      <div className="p-4 mt-auto">
        <div className="bg-slate-800/40 dark:bg-slate-900/40 rounded-2xl p-4 border border-slate-700/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-sm font-bold shadow-md shadow-blue-600/20">
              {getFirstLetter(user?.name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">{user?.name}</p>
              <p className="text-[10px] text-slate-400 font-medium truncate uppercase tracking-wider">{user?.email}</p>
            </div>
          </div>

        <button
          onClick={toggleTheme}
          className="sidebar-link w-full text-slate-400 hover:text-white mb-1 mx-0"
        >
          {theme === 'light' ? (
            <>
              <Moon className="w-4 h-4" />
              <span className="text-sm font-medium">Dark Mode</span>
            </>
          ) : (
            <>
              <Sun className="w-4 h-4" />
              <span className="text-sm font-medium">Light Mode</span>
            </>
          )}
        </button>

        <button
          onClick={logout}
          className="sidebar-link w-full text-slate-400 hover:text-red-400 mx-0"
        >
          <LogOut className="w-4 h-4" />
          <span className="text-sm font-medium">Logout</span>
        </button>
      </div>
    </div>
  </div>
)
}
