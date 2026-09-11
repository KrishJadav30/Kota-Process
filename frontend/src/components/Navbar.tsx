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
      icon: <Home className="h-4 w-4" />
    },
    {
      id: 'auto-process',
      label: 'Auto Process',
      icon: <Zap className="h-4 w-4" />
    },
    {
      id: 'manual-swapping',
      label: 'Manual Swapping',
      icon: <ArrowLeftRight className="h-4 w-4" />
    }
  ]

  return (
    <header className="sticky top-0 z-40 pt-4 sm:pt-5 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto bg-white/95 backdrop-blur-md border-2 border-slate-200 rounded-2xl shadow-sm px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo / Brand */}
          <div
            onClick={() => onSelectPage('home')}
            className="flex items-center gap-3 cursor-pointer group select-none"
          >
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center text-lg shadow-xs group-hover:scale-105 transition-transform">
              🚀
            </div>
            <div>
              <span className="text-lg font-black tracking-tight text-slate-950 block">
                KOTA Process
              </span>
              <span className="text-2xs font-bold text-slate-400 uppercase tracking-wider block">
                WebmisDB Operations
              </span>
            </div>
          </div>

          {/* Segmented Toggle Box */}
          <nav className="flex items-center bg-slate-100/90 p-1.5 rounded-xl border border-slate-200 gap-1 shadow-2xs">
            {navItems.map((item) => {
              const isActive = currentPage === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectPage(item.id)}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-950 hover:bg-slate-200/70'
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
