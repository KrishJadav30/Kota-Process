import React from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Zap, ArrowLeftRight, CheckCircle2 } from 'lucide-react'

interface HomePageProps {
  onNavigate: (page: 'auto-process' | 'manual-swapping') => void
}

export function HomePage({ onNavigate }: HomePageProps) {
  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-white border border-slate-200/90 rounded-xl p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs sm:text-sm font-semibold">
            <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse"></span>
            System Ready
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Welcome to KOTA Process
          </h1>
          <p className="text-slate-600 text-sm sm:text-base font-normal max-w-2xl">
            Centralized operations hub for automated background tasks, data synchronization, and manual swapping.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-700 bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl">
          <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600 shrink-0" />
          <span>Backend & Database Connected</span>
        </div>
      </div>

      {/* Quick Access Navigation Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {/* Auto Process Card */}
        <Card className="border border-slate-200/90 bg-white hover:border-blue-400 transition-all shadow-xs rounded-xl overflow-hidden group">
          <CardHeader className="p-5 pb-3">
            <div className="h-11 w-11 rounded-xl bg-blue-600 text-white flex items-center justify-center text-xl shadow-2xs mb-3 group-hover:scale-105 transition-transform">
              <Zap className="h-5.5 w-5.5" />
            </div>
            <div className="flex items-center gap-2.5">
              <CardTitle className="text-lg sm:text-xl font-bold text-slate-900">
                Auto Process
              </CardTitle>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                Entry = 4
              </span>
            </div>
            <CardDescription className="text-slate-500 text-xs sm:text-sm font-normal">
              Autonomous background task scheduler and automated batch processor.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-0 space-y-3.5">
            <p className="text-xs sm:text-sm text-slate-600 font-normal">
              Monitor 24/7 background jobs, configure daily execution schedules, and view process logs.
            </p>
            <Button
              onClick={() => onNavigate('auto-process')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm py-2.5 rounded-xl cursor-pointer flex items-center justify-center gap-2"
            >
              <span>Open Auto Process</span>
              <span>→</span>
            </Button>
          </CardContent>
        </Card>

        {/* Manual Swapping Card */}
        <Card className="border border-slate-200/90 bg-white hover:border-indigo-400 transition-all shadow-xs rounded-xl overflow-hidden group">
          <CardHeader className="p-5 pb-3">
            <div className="h-11 w-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-xl shadow-2xs mb-3 group-hover:scale-105 transition-transform">
              <ArrowLeftRight className="h-5.5 w-5.5" />
            </div>
            <div className="flex items-center gap-2.5">
              <CardTitle className="text-lg sm:text-xl font-bold text-slate-900">
                Manual Swapping
              </CardTitle>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                Entry = 2
              </span>
            </div>
            <CardDescription className="text-slate-500 text-xs sm:text-sm font-normal">
              Interactive manual data swapping and immediate transaction operations.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-0 space-y-3.5">
            <p className="text-xs sm:text-sm text-slate-600 font-normal">
              Execute on-demand swapping routines, verify parameters, and inspect records.
            </p>
            <Button
              onClick={() => onNavigate('manual-swapping')}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm py-2.5 rounded-xl cursor-pointer flex items-center justify-center gap-2"
            >
              <span>Open Manual Swapping</span>
              <span>→</span>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
