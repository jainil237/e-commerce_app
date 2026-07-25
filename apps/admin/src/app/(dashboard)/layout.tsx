'use client'

import { useAuth } from '@/components/providers'
import { Sidebar } from '@/components/layout/sidebar'
import { Loader2, Menu } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import '../../styles/admin.scss'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, isLoading } = useAuth()
  const router = useRouter()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  const isAdmin = user?.role === 'ADMIN'

  useEffect(() => {
    if (!isLoading && !isAdmin) {
      router.push('/login')
    }
  }, [isAdmin, isLoading, router])

  if (isLoading) {
    return (
      <div className="ms-admin__loading">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--brand-primary)]" />
      </div>
    )
  }

  if (!isAdmin) {
    return null
  }

  return (
    <div className="ms-admin">
      <a href="#admin-main" className="ms-admin__skip">
        Skip to main content
      </a>

      {isSidebarOpen && (
        <div className="ms-admin__overlay" onClick={() => setIsSidebarOpen(false)} />
      )}

      <div className={clsx('ms-admin__sidebar-wrap', isSidebarOpen && 'ms-admin__sidebar-wrap--open')}>
        <Sidebar onClose={() => setIsSidebarOpen(false)} />
      </div>

      <main id="admin-main" className="ms-admin__main" tabIndex={-1}>
        <div className="ms-admin__mobile-header">
          <span className="font-bold">Admin Panel</span>
          <button onClick={() => setIsSidebarOpen(true)} className="ms-admin__mobile-toggle" aria-label="Open menu">
            <Menu className="w-6 h-6" />
          </button>
        </div>

        <div className="ms-admin__content">
          {children}
        </div>
      </main>
    </div>
  )
}
