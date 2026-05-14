'use client'

import { useAuth } from '@/components/providers'
import { Sidebar } from '@/components/layout/sidebar'
import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, isLoading } = useAuth()
  const router = useRouter()

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
    <div className="min-h-screen bg-[var(--surface-1)]">
      <Sidebar />
      <main className="ml-64 min-h-screen">
        <div className="p-8 text-[var(--text-primary)]">
          {children}
        </div>
      </main>
    </div>
  )
}
