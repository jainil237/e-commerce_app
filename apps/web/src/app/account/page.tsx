'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { User, Package, MapPin, Heart, LogOut, ChevronRight, Mail } from 'lucide-react'
import { useAuth } from '@/components/providers'
import { getFirstLetter } from '@/utils/initials'

export default function AccountPage() {
  const router = useRouter()
  const { user, isLoading, logout } = useAuth()

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-16 text-center">
        <div className="skeleton w-8 h-8 rounded-full mx-auto" />
      </div>
    )
  }

  if (!user) {
    router.push('/account/login')
    return null
  }

  const handleLogout = async () => {
    await logout()
    router.push('/')
  }

  const menuItems = [
    { icon: Package, label: 'My Orders', href: '/account/orders', description: 'View order history' },
    { icon: MapPin, label: 'Addresses', href: '/account/addresses', description: 'Manage delivery addresses' },
    { icon: Heart, label: 'Wishlist', href: '/wishlist', description: 'Saved products' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-12">
      <div className="max-w-4xl mx-auto px-4 md:px-6 lg:px-8 py-8 md:py-12">
        {/* Profile Hero Section */}
        <div className="relative overflow-hidden rounded-3xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm mb-8">
          {/* Decorative background gradient */}
          <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-r from-brand-primary/20 via-brand-accent/20 to-brand-primary/20" />
          
          <div className="relative px-6 pb-8 pt-16 sm:px-10 sm:pb-10 sm:pt-20 flex flex-col sm:flex-row items-center sm:items-end gap-6 text-center sm:text-left">
            <div className="relative group">
              <div className="w-24 h-24 sm:w-32 sm:h-32 bg-gradient-to-br from-brand-primary to-brand-accent rounded-full flex items-center justify-center text-white text-4xl sm:text-5xl font-bold shadow-xl border-4 border-white dark:border-gray-900">
                {getFirstLetter(user.name)}
              </div>
              <div className="absolute inset-0 rounded-full shadow-inner pointer-events-none" />
            </div>
            
            <div className="flex-1 space-y-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
                {user.name}
              </h1>
              <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 text-sm text-gray-500 dark:text-gray-400">
                <span className="flex items-center gap-1.5"><Mail className="w-4 h-4" /> {user.email}</span>
                <span className="hidden sm:inline text-gray-300">•</span>
                <span className="flex items-center gap-1.5"><Package className="w-4 h-4" /> {user.phone}</span>
              </div>
            </div>

            <Link href="/account/edit" className="mt-4 sm:mt-0 px-6 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-900 dark:text-white rounded-full font-medium transition-colors duration-200">
              Edit Profile
            </Link>
          </div>
        </div>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-8">
          {menuItems.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className="group relative flex flex-col p-6 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-md hover:border-brand-primary/30 transition-all duration-300 overflow-hidden"
              >
                {/* Hover gradient effect */}
                <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                
                <div className="relative flex items-start justify-between">
                  <div className="w-12 h-12 rounded-2xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center group-hover:scale-110 group-hover:bg-brand-primary/10 transition-all duration-300">
                    <Icon className="w-6 h-6 text-gray-600 dark:text-gray-400 group-hover:text-brand-primary transition-colors" />
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-brand-primary group-hover:translate-x-1 transition-all duration-300" />
                </div>
                
                <div className="relative mt-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1 group-hover:text-brand-primary transition-colors">
                    {item.label}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {item.description}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>

        {/* Logout Section */}
        <div className="flex justify-center">
          <button
            onClick={handleLogout}
            className="group flex items-center gap-2 px-8 py-3 text-red-600 dark:text-red-400 font-medium hover:bg-red-50 dark:hover:bg-red-950/30 rounded-full transition-colors duration-200"
          >
            <LogOut className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
            Sign Out Securely
          </button>
        </div>
      </div>
    </div>
  )
}
