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
  X,
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

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="flex flex-col h-full w-64 bg-slate-900 text-white border-r border-slate-800 overflow-hidden shadow-2xl">
      {/* Logo */}
      <div className="flex items-center justify-between px-6 py-8">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-blue-600 rounded-xl shadow-lg shadow-blue-500/20">
            <Store className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white">Admin Panel</span>
        </div>
        {onClose && (
          <button 
            type="button" 
            onClick={onClose} 
            className="md:hidden p-2 text-slate-400 hover:bg-slate-800 hover:text-white rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 relative z-50"
            aria-label="Close sidebar"
          >
            <X className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto" style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
        {navigation.map((item) => {
          const isActive = pathname === item.href || 
            (item.href !== '/' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={onClose}
              className={`flex items-center gap-3 px-4 py-3 mx-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${isActive ? 'bg-blue-600 text-white font-semibold' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}
            >
              <item.icon className="w-5 h-5" />
              <span className="font-medium">{item.name}</span>
            </Link>
          )
        })}
      </nav>

      {/* User section */}
      <div className="p-4 mt-auto">
        <div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-sm font-bold shadow-md shadow-blue-600/20 text-white">
              {getFirstLetter(user?.name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{user?.name}</p>
              <p className="text-[10px] text-slate-400 font-medium truncate uppercase tracking-wider">{user?.email}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-3 py-2 text-slate-400 hover:text-white hover:bg-slate-800/40 rounded-md transition-colors mb-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
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
            type="button"
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-sm font-medium">Logout</span>
          </button>
        </div>
      </div>
    </div>
  )
}
