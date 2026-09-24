import React from 'react'
import { Home, Zap, ArrowLeftRight, Users, LogOut, User } from 'lucide-react'
import type { UserProfile } from '@/api'

export type PageId = 'home' | 'auto-process' | 'manual-swapping' | 'employee-process'

interface NavbarProps {
  currentPage: PageId
  onSelectPage: (page: PageId) => void
  user?: UserProfile | null
  onLogout?: () => void
}

export function Navbar({ currentPage, onSelectPage, user, onLogout }: NavbarProps) {
  const navItems: { id: PageId; label: string; icon: React.ReactNode; badge?: string }[] = [
    {
      id: 'home',
      label: 'Home',
      icon: <Home className="h-4.5 w-4.5" />
    },
    {
      id: 'auto-process',
      label: 'Auto Process',
      icon: <Zap className="h-4.5 w-4.5" />,
      badge: 'Entry = 4'
    },
    {
      id: 'manual-swapping',
      label: 'Manual Swapping',
      icon: <ArrowLeftRight className="h-4.5 w-4.5" />,
      badge: 'Entry = 2'
    },
    {
      id: 'employee-process',
      label: 'Employee Process',
      icon: <Users className="h-4.5 w-4.5" />,
      badge: 'Entry 2 / 4'
    }
  ]

  return (
    <header className="fixed top-0 left-0 right-0 z-40 pt-3 sm:pt-4 px-3 sm:px-6 lg:px-8 pointer-events-none transition-all">
      <div className="max-w-[96%] 2xl:max-w-[1720px] mx-auto glass-navbar rounded-2xl px-5 sm:px-7 lg:px-8 py-3 transition-all pointer-events-auto">
        <div className="flex items-center justify-between min-h-[46px] gap-4">
          {/* Logo / Brand */}
          <div
            onClick={() => onSelectPage('home')}
            className="flex items-center gap-3.5 cursor-pointer group select-none shrink-0"
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

          {/* Center/Right Section: Nav items + User & Logout */}
          <div className="flex items-center gap-3 sm:gap-4 flex-wrap justify-end">
            {/* Segmented Toggle Box */}
            <nav className="flex items-center bg-slate-200/35 p-1.5 rounded-xl border border-slate-300/40 gap-1.5 shadow-2xs">
              {navItems.map((item) => {
                const isActive = currentPage === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelectPage(item.id)}
                    className={`flex items-center gap-2.5 px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer min-h-[38px] ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/50'
                    }`}
                  >
                    {item.icon}
                    <div className="flex flex-col items-start text-left leading-none">
                      <span className="leading-tight">{item.label}</span>
                      {item.badge && (
                        <span
                          className={`text-[10px] font-bold tracking-tight mt-0.5 ${
                            isActive
                              ? 'text-blue-100'
                              : 'text-slate-500'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </nav>

            {/* User Profile & Logout */}
            <div className="flex items-center gap-2">
              {user && (
                <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200/80 text-slate-700 text-xs font-semibold">
                  <div className="h-6 w-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                    <User className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex flex-col text-left leading-tight">
                    <span className="text-slate-900 font-bold truncate max-w-[120px]">{user.name}</span>
                    <span className="text-2xs text-slate-500 truncate max-w-[120px]">{user.email}</span>
                  </div>
                </div>
              )}

              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  title="Sign out of KOTA Process"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-bold text-rose-700 bg-rose-50/90 hover:bg-rose-100 border border-rose-200/90 hover:border-rose-300 cursor-pointer shadow-2xs transition-all shrink-0"
                >
                  <LogOut className="h-4 w-4 text-rose-600" />
                  <span>Logout</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
