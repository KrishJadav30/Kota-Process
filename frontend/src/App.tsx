import React, { useState, useEffect, useCallback } from 'react'
import { Navbar, type PageId } from '@/components/Navbar'
import { HomePage } from '@/pages/HomePage'
import { AutoProcessPage } from '@/pages/AutoProcessPage'
import { ManualSwappingPage } from '@/pages/ManualSwappingPage'
import { EmployeeProcessPage } from '@/pages/EmployeeProcessPage'
import { LoginPage } from '@/pages/LoginPage'
import { getAuthUser, api, type UserProfile } from '@/api'

const getInitialPage = (): PageId => {
  // 1. Check window pathname first
  const path = window.location.pathname.toLowerCase()
  if (path.includes('employee-process') || path.includes('employee')) return 'employee-process'
  if (path.includes('manual-swapping') || path.includes('swapping')) return 'manual-swapping'
  if (path.includes('auto-process') || path.includes('auto')) return 'auto-process'

  // 2. Check hash
  const hash = window.location.hash.toLowerCase()
  if (hash.includes('employee-process') || hash.includes('employee')) return 'employee-process'
  if (hash.includes('manual-swapping') || hash.includes('swapping')) return 'manual-swapping'
  if (hash.includes('auto-process') || hash.includes('auto')) return 'auto-process'

  // 3. Fallback to localStorage
  const saved = localStorage.getItem('kota_active_page') as PageId | null
  if (saved === 'employee-process' || saved === 'manual-swapping' || saved === 'auto-process' || saved === 'home') {
    return saved
  }

  return 'home'
}

export function App() {
  const [user, setUser] = useState<UserProfile | null>(getAuthUser)
  const [currentPage, setCurrentPage] = useState<PageId>(getInitialPage)

  const handleSelectPage = useCallback((page: PageId) => {
    setCurrentPage(page)
    try {
      localStorage.setItem('kota_active_page', page)
      const targetPath = page === 'home' ? '/' : `/${page}`
      if (window.location.pathname !== targetPath) {
        window.history.pushState({ page }, '', targetPath)
      }
    } catch {
      // ignore storage errors
    }
  }, [])

  const handleLogout = useCallback(async () => {
    await api.logout(user?.email)
    setUser(null)
    setCurrentPage('home')
  }, [user])

  // Sync with browser Back/Forward navigation
  useEffect(() => {
    if (!user) return

    const handlePopState = () => {
      const page = getInitialPage()
      setCurrentPage(page)
      try {
        localStorage.setItem('kota_active_page', page)
      } catch {
        // ignore
      }
    }

    // Set initial URL if not matching current page
    const currentPath = window.location.pathname
    const expectedPath = currentPage === 'home' ? '/' : `/${currentPage}`
    if (currentPath !== expectedPath) {
      window.history.replaceState({ page: currentPage }, '', expectedPath)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [currentPage, user])

  // If user is not authenticated, render Login Page
  if (!user) {
    return <LoginPage onLoginSuccess={(loggedInUser) => setUser(loggedInUser)} />
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-950 font-sans flex flex-col">
      {/* Top Navigation Bar with User info and Logout */}
      <Navbar
        currentPage={currentPage}
        onSelectPage={handleSelectPage}
        user={user}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-[96%] 2xl:max-w-[1720px] mx-auto px-3 sm:px-6 lg:px-8 pt-36 sm:pt-40 lg:pt-44 pb-24 sm:pb-32">
        {currentPage === 'home' && (
          <HomePage onNavigate={handleSelectPage} />
        )}
        {currentPage === 'auto-process' && (
          <AutoProcessPage />
        )}
        {currentPage === 'manual-swapping' && (
          <ManualSwappingPage />
        )}
        {currentPage === 'employee-process' && (
          <EmployeeProcessPage />
        )}
      </main>
    </div>
  )
}

export default App




