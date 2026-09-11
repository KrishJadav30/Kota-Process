import React from 'react'
import { Home, Zap, ArrowLeftRight } from 'lucide-react'

export type PageId = 'home' | 'auto-process' | 'manual-swapping'

interface NavbarProps {
  currentPage: PageId
  onSelectPage: (page: PageId) => void
}

export function Navbar({ currentPage, onSelectPage }: NavbarProps) {
  const navItems: { id: PageId; label: string; icon: React.ReactNode }[] = [
    {
      id: 'home',
      label: 'Home',
      icon: <Home className="h-4.5 w-4.5" />
    },
    {
      id: 'auto-process',
      label: 'Auto Process',
      icon: <Zap className="h-4.5 w-4.5" />
    },
    {
      id: 'manual-swapping',
      label: 'Manual Swapping',
      icon: <ArrowLeftRight className="h-4.5 w-4.5" />
    }
  ]

  return (
    <header className="fixed top-0 left-0 right-0 z-40 pt-3 sm:pt-4 px-3 sm:px-6 lg:px-8 pointer-events-none transition-all">
      <div className="max-w-[96%] 2xl:max-w-[1720px] mx-auto glass-navbar rounded-2xl px-5 sm:px-7 lg:px-8 py-3 transition-all pointer-events-auto">
        <div className="flex items-center justify-between min-h-[46px]">
          {/* Logo / Brand */}
          <div
            onClick={() => onSelectPage('home')}
            className="flex items-center gap-3.5 cursor-pointer group select-none"
          >
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center text-xl shadow-2xs group-hover:scale-105 transition-transform shrink-0">
              🚀
            </div>
            <div>
              <span className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 block leading-tight">
                KOTA Process
              </span>
              <span className="text-xs sm:text-sm font-semibold text-slate-500 uppercase tracking-wider block mt-0.5">
                WebmisDB Operations
              </span>
            </div>
          </div>

          {/* Segmented Toggle Box */}
          <nav className="flex items-center bg-slate-200/35 p-1.5 rounded-xl border border-slate-300/40 gap-1.5 shadow-2xs">
            {navItems.map((item) => {
              const isActive = currentPage === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectPage(item.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm sm:text-base font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/50'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              )
            })}
          </nav>
        </div>
      </div>
    </header>
  )
}
