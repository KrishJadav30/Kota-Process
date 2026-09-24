import React, { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DatePicker } from '@/components/ui/date-picker'
import { formatLocalDate, parseLocalDate } from '@/lib/utils'
import { api, type ManualHistoryItem } from '@/api'
import { ArrowLeftRight, Database, Play, RefreshCw, Calendar, ArrowRight, CheckCircle2, AlertCircle, Timer, User } from 'lucide-react'

export function ManualSwappingPage() {
  const [history, setHistory] = useState<ManualHistoryItem[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isExecuting, setIsExecuting] = useState<boolean>(false)
  const [isRefreshingHistory, setIsRefreshingHistory] = useState<boolean>(false)

  // Date range state
  const [fromDate, setFromDate] = useState<string>(() => formatLocalDate(new Date()))
  const [toDate, setToDate] = useState<string>(() => formatLocalDate(new Date()))
  const [executionResult, setExecutionResult] = useState<{
    success: boolean
    message: string
    rowsUpdated?: number
    durationMs?: number
  } | null>(null)

  const loadHistory = useCallback(async () => {
    try {
      setIsRefreshingHistory(true)
      const data = await api.getManualSwappingHistory()
      setHistory([...data])
    } catch (err) {
      console.warn('Failed to load manual swapping history:', err)
    } finally {
      setIsRefreshingHistory(false)
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    async function init() {
      try {
        const data = await api.getManualSwappingHistory()
        if (isMounted) {
          setHistory([...data])
        }
      } catch (err) {
        console.warn('Failed to fetch manual history:', err)
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    init()

    return () => {
      isMounted = false
    }
  }, [])

  // Quick Presets
  const handlePresetToday = () => {
    const today = formatLocalDate(new Date())
    setFromDate(today)
    setToDate(today)
    setExecutionResult(null)
  }

  const handlePresetYesterday = () => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    const yest = formatLocalDate(d)
    setFromDate(yest)
    setToDate(yest)
    setExecutionResult(null)
  }

  const handlePresetLast7Days = () => {
    const now = new Date()
    const past = new Date()
    past.setDate(past.getDate() - 6)
    setFromDate(formatLocalDate(past))
    setToDate(formatLocalDate(now))
    setExecutionResult(null)
  }

  const handlePresetThisMonth = () => {
    const now = new Date()
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    setFromDate(formatLocalDate(firstDay))
    setToDate(formatLocalDate(lastDay))
    setExecutionResult(null)
  }

  const handlePresetPrevMonth = () => {
    const now = new Date()
    const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastDay = new Date(now.getFullYear(), now.getMonth(), 0)
    setFromDate(formatLocalDate(firstDay))
    setToDate(formatLocalDate(lastDay))
    setExecutionResult(null)
  }

  const handleExecuteSwapping = async () => {
    if (!fromDate || !toDate || isExecuting) return

    setIsExecuting(true)
    setExecutionResult(null)

    try {
      const result = await api.executeManualSwapping(fromDate, toDate)
      await loadHistory()

      if (result.status === 'Success') {
        setExecutionResult({
          success: true,
          message: result.message || `Swapping successfully updated ${result.rowsUpdated} rows in MonthTrns.`,
          rowsUpdated: result.rowsUpdated,
          durationMs: result.durationMs
        })
      } else {
        setExecutionResult({
          success: false,
          message: result.errorMessage || result.message || 'Manual swapping execution failed.'
        })
      }
    } catch (err: unknown) {
      console.error('Manual swapping execution failed:', err)
      const errorMsg = err instanceof Error ? err.message : 'Unknown execution error'
      setExecutionResult({
        success: false,
        message: `Execution error: ${errorMsg}`
      })
      await loadHistory()
    } finally {
      setIsExecuting(false)
    }
  }

  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return '-'
    const d = parseLocalDate(dateStr)
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const formatDateTime = (isoString?: string) => {
    if (!isoString) return '-'
    try {
      return new Date(isoString).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      })
    } catch {
      return isoString
    }
  }

  const calculateDaysCount = () => {
    if (!fromDate || !toDate) return 1
    const from = parseLocalDate(fromDate)
    const to = parseLocalDate(toDate)
    const diffTime = Math.abs(to.getTime() - from.getTime())
    return Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1
  }

  return (
    <div className="space-y-6 w-full">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              Manual Swapping
            </h1>
            <Badge variant="outline" className="text-xs font-semibold px-2.5 py-0.5 text-indigo-700 border-indigo-300 bg-indigo-50">
              100% Manual Execution
            </Badge>
            <Badge variant="outline" className="text-xs font-semibold px-2.5 py-0.5 text-purple-700 border-purple-300 bg-purple-50">
              Entry = 2
            </Badge>
          </div>
          <p className="text-slate-600 text-sm sm:text-base font-normal mt-1">
            Execute manual punch swapping on MonthTrns based on 2 required entries (Entry 2). This operation is 100% manual and runs on-demand strictly when triggered.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs self-start sm:self-auto">
          <Database className="h-4 w-4 text-indigo-600 shrink-0" />
          <span>WebmisDB Ready</span>
          <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
        </div>
      </div>

      {/* 1. Manual Swapping Operation Controls Card */}
      <Card className="border border-slate-200/90 bg-white shadow-xs rounded-xl overflow-visible w-full relative z-20">
        <CardHeader className="p-5 pb-4 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold shadow-2xs shrink-0">
                <ArrowLeftRight className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg sm:text-xl font-bold text-slate-900">
                  Data Swapping Operations
                </CardTitle>
                <CardDescription className="text-slate-500 text-xs sm:text-sm font-normal mt-0.5">
                  Select date range to recalculate MonthTrns arrival/departure and rest punches using Entry 2 rules.
                </CardDescription>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-indigo-900 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-lg">
                entreq = 2 Ruleset
              </span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-5 space-y-5 overflow-visible">
          {/* Quick Date Presets */}
          <div>
            <label className="block text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-500 mb-2">
              Quick Date Presets
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handlePresetToday}
                disabled={isExecuting}
                className="px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-300 text-slate-700 hover:text-indigo-700 cursor-pointer transition-colors"
              >
                Today
              </button>
              <button
                type="button"
                onClick={handlePresetYesterday}
                disabled={isExecuting}
                className="px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-300 text-slate-700 hover:text-indigo-700 cursor-pointer transition-colors"
              >
                Yesterday
              </button>
              <button
                type="button"
                onClick={handlePresetLast7Days}
                disabled={isExecuting}
                className="px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-300 text-slate-700 hover:text-indigo-700 cursor-pointer transition-colors"
              >
                Last 7 Days
              </button>
              <button
                type="button"
                onClick={handlePresetThisMonth}
                disabled={isExecuting}
                className="px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg border border-indigo-200 bg-indigo-50/90 hover:bg-indigo-100 text-indigo-800 cursor-pointer transition-colors"
              >
                This Month
              </button>
              <button
                type="button"
                onClick={handlePresetPrevMonth}
                disabled={isExecuting}
                className="px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg border border-purple-200 bg-purple-50/90 hover:bg-purple-100 text-purple-800 cursor-pointer transition-colors"
              >
                Previous Month
              </button>
            </div>
          </div>

          {/* Date Range Summary Banner */}
          <div className="p-3.5 bg-indigo-50/60 border border-indigo-200/90 rounded-xl flex items-center justify-between text-xs sm:text-sm font-semibold text-indigo-950 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-indigo-600 shrink-0" />
              <span>{formatDisplayDate(fromDate)}</span>
              <ArrowRight className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
              <span>{formatDisplayDate(toDate)}</span>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-200/80 text-indigo-900 text-xs font-bold shrink-0">
              {calculateDaysCount()} {calculateDaysCount() === 1 ? 'day' : 'days'} selected
            </span>
          </div>

          {/* Dual Date Pickers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 relative z-30">
            <DatePicker
              label="From Date"
              value={fromDate}
              onChange={(val) => {
                setFromDate(val)
                if (toDate < val) setToDate(val)
                setExecutionResult(null)
              }}
              disabled={isExecuting}
              align="left"
            />

            <DatePicker
              label="To Date"
              value={toDate}
              onChange={(val) => {
                setToDate(val)
                if (fromDate > val) setFromDate(val)
                setExecutionResult(null)
              }}
              disabled={isExecuting}
              align="right"
            />
          </div>

          {/* Execution Button & Action Row */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <div className="text-xs text-slate-500 font-medium">
              <span>Runs with 10-minute timeout for large month-wide datasets.</span>
            </div>

            <Button
              type="button"
              onClick={handleExecuteSwapping}
              disabled={isExecuting || !fromDate || !toDate}
              className="w-full sm:w-auto h-10 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs sm:text-sm rounded-lg shadow-2xs flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              {isExecuting ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin text-white" />
                  <span>Executing Swapping Query...</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-white" />
                  <span>Execute Manual Swapping</span>
                </>
              )}
            </Button>
          </div>

          {/* Live Execution Feedback Alert */}
          {executionResult && (
            <div
              className={`p-4 rounded-xl border flex items-start gap-3 animate-in fade-in text-xs sm:text-sm font-semibold ${
                executionResult.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              {executionResult.success ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 space-y-1">
                <p className="font-bold">
                  {executionResult.success ? 'Swapping Query Executed Successfully' : 'Execution Failed'}
                </p>
                <p className="font-normal text-slate-700 text-xs sm:text-sm">
                  {executionResult.message}
                </p>
                {executionResult.success && executionResult.rowsUpdated !== undefined && (
                  <div className="flex items-center gap-2 pt-1 text-xs">
                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                      {executionResult.rowsUpdated} rows updated
                    </span>
                    <span className="text-slate-500 font-normal">
                      Completed in {executionResult.durationMs?.toLocaleString()} ms
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. Top 50 Execution Logs Table (Mirrored from Auto Process) */}
      <Card className="border border-slate-200/90 bg-white shadow-xs rounded-xl overflow-hidden w-full relative z-10">
        <CardHeader className="p-4 sm:p-5 pb-3.5 border-b border-slate-200 bg-slate-50/60">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2.5">
                <CardTitle className="text-lg sm:text-xl font-bold text-slate-900">
                  Manual Swapping History Logs
                </CardTitle>
                <Badge variant="outline" className="text-xs sm:text-sm font-semibold bg-white text-slate-600 border-slate-300">
                  Top 50 Executions
                </Badge>
              </div>
              <CardDescription className="text-slate-500 text-xs sm:text-sm font-normal mt-0.5">
                Audit trail of 100% manual record swapping operations performed on WebmisDB (Entry 2).
              </CardDescription>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={loadHistory}
              disabled={isRefreshingHistory}
              className="self-start sm:self-auto h-9 px-3.5 text-xs sm:text-sm font-semibold border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer flex items-center gap-1.5"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshingHistory ? 'animate-spin text-indigo-600' : ''}`} />
              <span>Refresh Logs</span>
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 text-center text-slate-500 space-y-2">
              <RefreshCw className="h-7 w-7 animate-spin text-indigo-600 mx-auto" />
              <p className="text-xs sm:text-sm font-semibold text-slate-700">Loading manual swapping logs...</p>
            </div>
          ) : history.length === 0 ? (
            <div className="py-12 text-center text-slate-500 space-y-2">
              <Timer className="h-8 w-8 text-slate-400 mx-auto" />
              <p className="text-sm sm:text-base font-semibold text-slate-700">No manual swapping records logged yet</p>
              <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto">
                Select a date range above and click &quot;Execute Manual Swapping&quot; to perform the procedure. Execution records will be saved and displayed here.
              </p>
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm table-auto">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100/90 text-slate-600 font-bold uppercase text-xs tracking-wider divide-x divide-slate-200 border-l-4 border-l-transparent">
                    <th className="py-3.5 px-3 sm:px-4 whitespace-nowrap w-[170px]">Date Processed</th>
                    <th className="py-3.5 px-3 sm:px-4 whitespace-nowrap w-[170px]">Run Timestamp</th>
                    <th className="py-3.5 px-2.5 sm:px-3 whitespace-nowrap text-center w-[100px]">Status</th>
                    <th className="py-3.5 px-2.5 sm:px-3 whitespace-nowrap text-right w-[95px]">Duration</th>
                    <th className="py-3.5 px-3 sm:px-4 whitespace-nowrap w-[180px]">MonthTrns Records</th>
                    <th className="py-3.5 px-3 sm:px-4 w-[270px]">Trigger Type</th>
                    <th className="py-3.5 px-3 sm:px-4 w-[320px] max-w-[360px]">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white font-normal">
                  {history.map((item) => {
                    const isSuccess = item.status === 'Success'
                    return (
                      <tr
                        key={item.id}
                        className="divide-x divide-slate-200 border-l-4 border-l-amber-500 bg-amber-50/15 hover:bg-amber-50/40 transition-colors"
                      >
                        {/* Process Date */}
                        <td className="py-3.5 px-3 sm:px-4 font-semibold text-slate-900 whitespace-nowrap text-sm w-[170px]">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-4 w-4 text-amber-600 shrink-0" />
                            <span>{item.processDate}</span>
                          </div>
                        </td>

                        {/* Run Timestamp */}
                        <td className="py-3.5 px-3 sm:px-4 text-slate-700 whitespace-nowrap font-medium text-sm w-[170px]">
                          {formatDateTime(item.executedAt)}
                        </td>

                        {/* Status Badge */}
                        <td className="py-3.5 px-2.5 sm:px-3 whitespace-nowrap text-center w-[100px]">
                          <span
                            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-semibold ${
                              isSuccess
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {isSuccess ? 'Success' : 'Failed'}
                            <span className="text-2xs">{isSuccess ? '✓' : '✕'}</span>
                          </span>
                        </td>

                        {/* Duration */}
                        <td className="py-3.5 px-2.5 sm:px-3 text-slate-800 whitespace-nowrap text-right text-sm font-semibold w-[95px]">
                          <span>{item.durationMs.toLocaleString()}</span> <span className="text-slate-500 font-normal text-sm">ms</span>
                        </td>

                        {/* Rows Processed */}
                        <td className="py-3.5 px-3 sm:px-4 whitespace-nowrap w-[180px]">
                          <span className="px-2.5 py-1 rounded-md bg-amber-50 text-amber-800 font-semibold border border-amber-200 text-xs sm:text-sm">
                            {item.rowsUpdated.toLocaleString()} updated
                          </span>
                        </td>

                        {/* Trigger Source */}
                        <td className="py-3.5 px-3 sm:px-4 text-slate-700 text-sm w-[270px]">
                          <div className="p-2 rounded-lg bg-amber-50/90 border border-amber-200/90 text-amber-950 flex flex-col gap-1 shadow-2xs">
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs font-extrabold uppercase tracking-wider bg-amber-600 text-white shadow-2xs">
                                <User className="h-3 w-3" />
                                Manual Run
                              </span>
                              <span className="text-2xs font-semibold text-amber-800">Entry 2 Rule</span>
                            </div>
                            <div className="text-xs font-semibold text-amber-900 leading-snug break-words">
                              {item.triggerSource}
                            </div>
                          </div>
                        </td>

                        {/* Details */}
                        <td className="py-3.5 px-3 sm:px-4 text-slate-700 text-sm w-[320px] max-w-[360px]">
                          {isSuccess ? (
                            <div className="flex items-center gap-2 text-slate-700 text-sm font-normal">
                              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 self-start sm:self-center mt-0.5 sm:mt-0" />
                              <span className="leading-normal">{item.message}</span>
                            </div>
                          ) : (
                            <div className="flex items-start gap-2 text-rose-700 font-medium text-sm leading-snug break-words">
                              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
                              <span className="break-words" title={item.errorMessage || item.message}>
                                {item.errorMessage || item.message}
                              </span>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {/* Table Footer */}
              <div className="py-3.5 px-4 sm:px-5 border-t border-slate-200 bg-slate-50/80 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs sm:text-sm text-slate-600 font-medium">
                <span>
                  Showing {history.length} execution record{history.length === 1 ? '' : 's'}
                </span>
                <span className="text-slate-500 text-xs">
                  100% manual on-demand execution (no automated schedules)
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
