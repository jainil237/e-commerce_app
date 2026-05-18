'use client'

import { useAuth } from '@/components/providers'
import { Sidebar } from '@/components/layout/sidebar'
import { Loader2, Menu, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, isLoading } = useAuth()
  const router = useRouter()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login')
    }
  }, [user, isLoading, router])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="min-h-screen bg-[var(--surface-1)] flex">
      <a href="#admin-main" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:p-4 focus:bg-blue-600 focus:text-white">
        Skip to main content
      </a>
      
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar Wrapper */}
      <div className={`fixed inset-y-0 left-0 z-50 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 transition-transform duration-200 ease-in-out md:relative md:w-64 h-full`}>
        <Sidebar onClose={() => setIsSidebarOpen(false)} />
      </div>

      <main id="admin-main" className="flex-1 min-w-0 flex flex-col min-h-screen focus:outline-none" tabIndex={-1}>
        {/* Mobile Header Toggle */}
        <div className="md:hidden flex items-center justify-between p-4 bg-[var(--surface-2)] border-b border-[var(--border-base)]">
          <span className="font-bold">Admin Panel</span>
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 bg-[var(--surface-3)] rounded-md">
            <Menu className="w-6 h-6" />
          </button>
        </div>
        
        <div className="p-4 sm:p-6 lg:p-8 text-[var(--text-primary)] flex-1">
          {children}
        </div>
      </main>
    </div>
  )
}
