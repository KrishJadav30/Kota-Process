import React, { useState } from 'react'
import { Navbar, type PageId } from '@/components/Navbar'
import { HomePage } from '@/pages/HomePage'
import { AutoProcessPage } from '@/pages/AutoProcessPage'
import { ManualSwappingPage } from '@/pages/ManualSwappingPage'

export function App() {
  const [currentPage, setCurrentPage] = useState<PageId>('home')

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-950 font-sans flex flex-col">
      {/* Top Navigation Bar */}
      <Navbar currentPage={currentPage} onSelectPage={setCurrentPage} />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8">
        {currentPage === 'home' && (
          <HomePage onNavigate={setCurrentPage} />
        )}
        {currentPage === 'auto-process' && (
          <AutoProcessPage />
        )}
        {currentPage === 'manual-swapping' && (
          <ManualSwappingPage />
        )}
      </main>
    </div>
  )
}

export default App


