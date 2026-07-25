'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Package, MapPin, Heart, LogOut, ChevronRight, Mail } from 'lucide-react'
import { useAuth } from '@/contexts/auth.context'
import { getFirstLetter } from '@/utils/initials'
import './account.scss'

export default function AccountPage() {
  const router = useRouter()
  const { user, isLoading, logout } = useAuth()

  if (isLoading) {
    return (
      <div className="ms-account__loading">
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
    <div className="ms-account">
      <div className="ms-account__container">
        {/* Profile Hero Section */}
        <div className="ms-account-hero">
          <div className="ms-account-hero__gradient" />

          <div className="ms-account-hero__body">
            <div className="ms-account-hero__avatar">
              {getFirstLetter(user.name)}
            </div>

            <div className="ms-account-hero__info">
              <h1 className="ms-account-hero__name">{user.name}</h1>
              <div className="ms-account-hero__meta">
                <span className="ms-account-hero__meta-item"><Mail className="w-4 h-4" /> {user.email}</span>
                <span className="ms-account-hero__sep">•</span>
                <span className="ms-account-hero__meta-item"><Package className="w-4 h-4" /> {user.phone}</span>
              </div>
            </div>

            <Link href="/account/edit" className="ms-account-hero__edit">
              Edit Profile
            </Link>
          </div>
        </div>

        {/* Dashboard Grid */}
        <div className="ms-account-grid">
          {menuItems.map((item) => {
            const Icon = item.icon
            return (
              <Link key={item.href} href={item.href} className="ms-account-tile">
                <div className="ms-account-tile__sheen" />

                <div className="ms-account-tile__row">
                  <div className="ms-account-tile__icon-wrap">
                    <Icon className="ms-account-tile__icon w-6 h-6" />
                  </div>
                  <ChevronRight className="ms-account-tile__chevron w-5 h-5" />
                </div>

                <div className="ms-account-tile__text">
                  <h3 className="ms-account-tile__title">{item.label}</h3>
                  <p className="ms-account-tile__desc">{item.description}</p>
                </div>
              </Link>
            )
          })}
        </div>

        {/* Logout Section */}
        <div className="ms-account-logout">
          <button onClick={handleLogout} className="ms-account-logout__btn">
            <LogOut className="ms-account-logout__icon w-5 h-5" />
            Sign Out Securely
          </button>
        </div>
      </div>
    </div>
  )
}
