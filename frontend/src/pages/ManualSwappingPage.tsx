import React from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeftRight, Database, SlidersHorizontal } from 'lucide-react'

export function ManualSwappingPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              Manual Swapping
            </h1>
            <Badge variant="outline" className="text-2xs font-semibold px-2.5 py-0.5 text-indigo-700 border-indigo-300 bg-indigo-50">
              Interactive
            </Badge>
          </div>
          <p className="text-slate-500 text-sm font-normal mt-1">
            Execute manual records swapping, inspect parameters, and trigger controlled swaps.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs">
          <Database className="h-4 w-4 text-indigo-600 shrink-0" />
          <span>WebmisDB Ready</span>
        </div>
      </div>

      {/* Main Swapping Card */}
      <Card className="border border-slate-200/90 bg-white shadow-xs rounded-xl overflow-hidden">
        <CardHeader className="p-5 pb-3.5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold shrink-0">
              <ArrowLeftRight className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base sm:text-lg font-bold text-slate-900">
                Data Swapping Operations
              </CardTitle>
              <CardDescription className="text-slate-500 text-xs font-normal">
                Perform controlled record swapping with instant feedback and database commit.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-5 space-y-4">
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-8 text-center space-y-2">
            <SlidersHorizontal className="h-7 w-7 text-slate-400 mx-auto" />
            <h3 className="text-sm font-bold text-slate-800">
              Ready for Swapping Fields & Controls
            </h3>
            <p className="text-xs text-slate-500 font-normal max-w-md mx-auto">
              Whenever you provide the exact parameters, IDs, or table definitions for manual swapping, they will be built directly here.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
