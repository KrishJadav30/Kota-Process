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
      <div className="bg-white border-2 border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold">
            <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse"></span>
            System Ready
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-950 tracking-tight">
            Welcome to KOTA Process
          </h1>
          <p className="text-slate-600 text-sm font-medium max-w-2xl">
            Centralized operations hub for automated background tasks, data synchronization, and manual swapping.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span>Backend & Database Connected</span>
        </div>
      </div>

      {/* Quick Access Navigation Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {/* Auto Process Card */}
        <Card className="border-2 border-slate-200 bg-white hover:border-blue-400 transition-all shadow-xs rounded-2xl overflow-hidden group">
          <CardHeader className="pb-4">
            <div className="h-12 w-12 rounded-xl bg-blue-600 text-white flex items-center justify-center text-xl shadow-xs mb-3 group-hover:scale-105 transition-transform">
              <Zap className="h-6 w-6" />
            </div>
            <CardTitle className="text-xl font-extrabold text-slate-950">
              Auto Process
            </CardTitle>
            <CardDescription className="text-slate-600 text-xs font-medium">
              Autonomous background task scheduler and automated batch processor.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            <p className="text-xs text-slate-500 font-medium">
              Monitor 24/7 background jobs, configure daily execution schedules, and view process logs.
            </p>
            <Button
              onClick={() => onNavigate('auto-process')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2 rounded-lg cursor-pointer flex items-center justify-center gap-2"
            >
              Open Auto Process →
            </Button>
          </CardContent>
        </Card>

        {/* Manual Swapping Card */}
        <Card className="border-2 border-slate-200 bg-white hover:border-indigo-400 transition-all shadow-xs rounded-2xl overflow-hidden group">
          <CardHeader className="pb-4">
            <div className="h-12 w-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-xl shadow-xs mb-3 group-hover:scale-105 transition-transform">
              <ArrowLeftRight className="h-6 w-6" />
            </div>
            <CardTitle className="text-xl font-extrabold text-slate-950">
              Manual Swapping
            </CardTitle>
            <CardDescription className="text-slate-600 text-xs font-medium">
              Interactive manual data swapping and immediate transaction operations.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            <p className="text-xs text-slate-500 font-medium">
              Execute on-demand swapping routines, verify parameters, and inspect records.
            </p>
            <Button
              onClick={() => onNavigate('manual-swapping')}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2 rounded-lg cursor-pointer flex items-center justify-center gap-2"
            >
              Open Manual Swapping →
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
