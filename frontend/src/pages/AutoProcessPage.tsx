import React, { useEffect, useState, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DatePicker } from '@/components/ui/date-picker'
import { formatLocalDate, parseLocalDate } from '@/lib/utils'
import { api, type SchedulerStatusDto, type ProcessHistoryItem, type ScheduledTimeSlot, type WeeklyScheduleSlot } from '@/api'
import { Clock, Save, CheckCircle2, Play, RefreshCw, X, Calendar, ArrowRight, Timer, AlertCircle, Bot, User } from 'lucide-react'

const DEFAULT_SCHEDULES: ScheduledTimeSlot[] = [
  { id: 'shift-1', label: 'Night Shift', time: '06:00', isEnabled: true, isNightShift: true },
  { id: 'shift-2', label: 'Morning Shift', time: '12:00', isEnabled: true, isNightShift: false },
  { id: 'shift-3', label: 'Evening Shift', time: '18:00', isEnabled: true, isNightShift: false },
  { id: 'shift-4', label: 'Midnight Shift', time: '00:00', isEnabled: true, isNightShift: true }
]

const DEFAULT_WEEKLY_SCHEDULE: WeeklyScheduleSlot = {
  id: 'weekly-1',
  label: 'Weekly Schedule',
  dayOfWeek: 'Monday',
  time: '06:00',
  isEnabled: false,
  daysCount: 8
}

export function AutoProcessPage() {
  const [scheduler, setScheduler] = useState<SchedulerStatusDto | null>(null)
  const [history, setHistory] = useState<ProcessHistoryItem[]>([])
  const [historyFilter, setHistoryFilter] = useState<'all' | 'automated' | 'manual'>('all')
  const [schedules, setSchedules] = useState<ScheduledTimeSlot[]>(DEFAULT_SCHEDULES)
  const schedulesRef = useRef<ScheduledTimeSlot[]>(DEFAULT_SCHEDULES)
  const [weeklySchedule, setWeeklySchedule] = useState<WeeklyScheduleSlot>(DEFAULT_WEEKLY_SCHEDULE)
  const weeklyScheduleRef = useRef<WeeklyScheduleSlot>(DEFAULT_WEEKLY_SCHEDULE)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [isSaved, setIsSaved] = useState<boolean>(false)
  const [isSavingWeekly, setIsSavingWeekly] = useState<boolean>(false)
  const [isSavedWeekly, setIsSavedWeekly] = useState<boolean>(false)
  const [isRunningNow, setIsRunningNow] = useState<boolean>(false)
  const [isRefreshingHistory, setIsRefreshingHistory] = useState<boolean>(false)

  // Date range modal state - initialized to local date
  const [isRunModalOpen, setIsRunModalOpen] = useState<boolean>(false)
  const [fromDate, setFromDate] = useState<string>(() => formatLocalDate(new Date()))
  const [toDate, setToDate] = useState<string>(() => formatLocalDate(new Date()))
  const [runMessage, setRunMessage] = useState<string | null>(null)

  const isAutomatedTrigger = (trigger?: string) => {
    if (!trigger) return false
    const lower = trigger.toLowerCase()
    return lower.includes('autonomous') || lower.includes('schedule') || lower.includes('auto')
  }

  const loadHistory = useCallback(async () => {
    try {
      setIsRefreshingHistory(true)
      const [historyData, configData] = await Promise.allSettled([
        api.getProcessHistory(),
        api.getSchedulerConfig()
      ])

      if (historyData.status === 'fulfilled') {
        setHistory([...historyData.value])
      }
      if (configData.status === 'fulfilled') {
        setScheduler({ ...configData.value })
      }
    } catch (err) {
      console.warn('Failed to load process history:', err)
    } finally {
      setIsRefreshingHistory(false)
    }
  }, [])

  // Fetch initial data on mount once, and poll background history/status every 8s
  // Strictly prevent background polling from resetting or overwriting active schedules state!
  useEffect(() => {
    let isMounted = true

    async function initialFetch() {
      try {
        const [configData, historyData] = await Promise.allSettled([
          api.getSchedulerConfig(),
          api.getProcessHistory()
        ])

        if (!isMounted) return

        if (configData.status === 'fulfilled') {
          setScheduler(configData.value)
          if (configData.value.schedules && configData.value.schedules.length > 0) {
            const list = configData.value.schedules
            const s1 = list.find(s => s.id === 'shift-1' || s.label.toLowerCase().startsWith('night'))
              || { id: 'shift-1', label: 'Night Shift', time: '06:00', isEnabled: true, isNightShift: true }
            const s2 = list.find(s => s.id === 'shift-2' || s.label.toLowerCase().startsWith('morning'))
              || { id: 'shift-2', label: 'Morning Shift', time: '12:00', isEnabled: true, isNightShift: false }
            const s3 = list.find(s => s.id === 'shift-3' || s.label.toLowerCase().startsWith('evening'))
              || { id: 'shift-3', label: 'Evening Shift', time: '18:00', isEnabled: true, isNightShift: false }
            const s4 = list.find(s => s.id === 'shift-4' || s.label.toLowerCase().startsWith('midnight'))
              || { id: 'shift-4', label: 'Midnight Shift', time: '00:00', isEnabled: true, isNightShift: true }

            s1.label = 'Night Shift'
            s2.label = 'Morning Shift'
            s3.label = 'Evening Shift'
            s4.label = 'Midnight Shift'

            const loaded = [s1, s2, s3, s4]
            setSchedules(loaded)
            schedulesRef.current = loaded
          }

          if (configData.value.weeklySchedule) {
            const ws = configData.value.weeklySchedule
            const loadedWeekly: WeeklyScheduleSlot = {
              id: ws.id || 'weekly-1',
              label: ws.label || 'Weekly Schedule',
              dayOfWeek: ws.dayOfWeek || 'Monday',
              time: ws.time || '06:00',
              isEnabled: !!ws.isEnabled,
              daysCount: 8
            }
            setWeeklySchedule(loadedWeekly)
            weeklyScheduleRef.current = loadedWeekly
          }
        }

        if (historyData.status === 'fulfilled') {
          setHistory([...historyData.value])
        }
      } catch (err) {
        console.warn('Failed to fetch scheduler data:', err)
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    initialFetch()

    // Autonomous polling: refresh every 8s ONLY for history logs and scheduler next run status
    // NEVER overwrite the user's active schedules form state!
    const pollInterval = setInterval(async () => {
      if (document.visibilityState !== 'visible') return

      try {
        const [historyData, configData] = await Promise.allSettled([
          api.getProcessHistory(),
          api.getSchedulerConfig()
        ])

        if (!isMounted) return

        if (historyData.status === 'fulfilled') {
          setHistory([...historyData.value])
        }
        if (configData.status === 'fulfilled') {
          setScheduler(configData.value)
        }
      } catch (err) {
        console.warn('Background polling error:', err)
      }
    }, 8000)

    return () => {
      isMounted = false
      clearInterval(pollInterval)
    }
  }, [])

  // Lock body scroll and listen for Escape key when modal is open
  useEffect(() => {
    if (isRunModalOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isRunModalOpen && !isRunningNow) {
        setIsRunModalOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isRunModalOpen, isRunningNow])

  const handleSlotTimeChange = (index: number, newTime: string) => {
    const current = schedulesRef.current
    const updatedSchedules = current.map((slot, i) =>
      i === index ? { ...slot, time: newTime } : slot
    )
    schedulesRef.current = updatedSchedules
    setSchedules(updatedSchedules)
    setIsSaved(false)
  }

  // Toggling Active/Paused updates immediately and auto-persists to backend without race conditions
  const handleToggleEnabled = async (index: number) => {
    const current = schedulesRef.current
    const updatedSchedules = current.map((slot, i) =>
      i === index ? { ...slot, isEnabled: !slot.isEnabled } : slot
    )
    schedulesRef.current = updatedSchedules
    setSchedules(updatedSchedules)
    setIsSaved(false)

    try {
      const updated = await api.updateSchedulerConfig(undefined, true, updatedSchedules)
      setScheduler(updated)
      setIsSaved(true)
      setTimeout(() => setIsSaved(false), 2500)
    } catch (err) {
      console.error('Failed to auto-save shift toggle:', err)
    }
  }

  // Toggling 2-Day / 1-Day updates immediately and auto-persists to backend
  const handleToggleNightShift = async (index: number) => {
    const current = schedulesRef.current
    const updatedSchedules = current.map((slot, i) =>
      i === index ? { ...slot, isNightShift: !slot.isNightShift } : slot
    )
    schedulesRef.current = updatedSchedules
    setSchedules(updatedSchedules)
    setIsSaved(false)

    try {
      const updated = await api.updateSchedulerConfig(undefined, true, updatedSchedules)
      setScheduler(updated)
      setIsSaved(true)
      setTimeout(() => setIsSaved(false), 2500)
    } catch (err) {
      console.error('Failed to auto-save night shift toggle:', err)
    }
  }

  const handleSaveAllSchedules = async () => {
    setIsSaving(true)
    setIsSaved(false)
    try {
      const current = schedulesRef.current
      const currentWeekly = weeklyScheduleRef.current
      const updated = await api.updateSchedulerConfig(undefined, true, current, currentWeekly)
      setScheduler(updated)
      if (updated.schedules && updated.schedules.length > 0) {
        setSchedules(updated.schedules)
        schedulesRef.current = updated.schedules
      }
      if (updated.weeklySchedule) {
        setWeeklySchedule(updated.weeklySchedule)
        weeklyScheduleRef.current = updated.weeklySchedule
      }
      setIsSaved(true)
      setTimeout(() => setIsSaved(false), 3000)
    } catch (err) {
      console.error('Failed to save scheduler config:', err)
      alert('Failed to save schedules to server: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setIsSaving(false)
    }
  }

  // Weekly Schedule Handlers
  const handleWeeklyDayChange = (day: string) => {
    const updated: WeeklyScheduleSlot = {
      ...weeklyScheduleRef.current,
      dayOfWeek: day
    }
    weeklyScheduleRef.current = updated
    setWeeklySchedule(updated)
    setIsSavedWeekly(false)
  }

  const handleWeeklyTimeChange = (time: string) => {
    const updated: WeeklyScheduleSlot = {
      ...weeklyScheduleRef.current,
      time
    }
    weeklyScheduleRef.current = updated
    setWeeklySchedule(updated)
    setIsSavedWeekly(false)
  }

  const handleToggleWeeklyEnabled = async () => {
    const updated: WeeklyScheduleSlot = {
      ...weeklyScheduleRef.current,
      isEnabled: !weeklyScheduleRef.current.isEnabled
    }
    weeklyScheduleRef.current = updated
    setWeeklySchedule(updated)
    setIsSavedWeekly(false)

    try {
      const currentSchedules = schedulesRef.current
      const result = await api.updateSchedulerConfig(undefined, true, currentSchedules, updated)
      setScheduler(result)
      setIsSavedWeekly(true)
      setTimeout(() => setIsSavedWeekly(false), 2500)
    } catch (err) {
      console.error('Failed to toggle weekly schedule:', err)
    }
  }

  const handleSaveWeeklySchedule = async () => {
    setIsSavingWeekly(true)
    setIsSavedWeekly(false)
    try {
      const current = weeklyScheduleRef.current
      const currentSchedules = schedulesRef.current
      const result = await api.updateSchedulerConfig(undefined, true, currentSchedules, current)
      setScheduler(result)
      if (result.weeklySchedule) {
        setWeeklySchedule(result.weeklySchedule)
        weeklyScheduleRef.current = result.weeklySchedule
      }
      setIsSavedWeekly(true)
      setTimeout(() => setIsSavedWeekly(false), 3000)
    } catch (err) {
      console.error('Failed to save weekly schedule:', err)
      alert('Failed to save weekly schedule to server: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setIsSavingWeekly(false)
    }
  }

  // Presets Handlers
  const handlePresetToday = () => {
    const today = formatLocalDate(new Date())
    setFromDate(today)
    setToDate(today)
  }

  const handlePresetYesterday = () => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    const yest = formatLocalDate(d)
    setFromDate(yest)
    setToDate(yest)
  }

  const handlePresetLast7Days = () => {
    const now = new Date()
    const past = new Date()
    past.setDate(past.getDate() - 6)
    setFromDate(formatLocalDate(past))
    setToDate(formatLocalDate(now))
  }

  const handlePresetWeekly8Days = () => {
    const now = new Date()
    const past = new Date()
    past.setDate(past.getDate() - 7)
    setFromDate(formatLocalDate(past))
    setToDate(formatLocalDate(now))
  }

  const handlePresetThisMonth = () => {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0) // Exact end of month (30 for Sep, 31 for Aug/Oct/Dec)
    setFromDate(formatLocalDate(firstDay))
    setToDate(formatLocalDate(lastDay))
  }

  const handlePresetPrevMonth = () => {
    const now = new Date()
    const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastDay = new Date(now.getFullYear(), now.getMonth(), 0)
    setFromDate(formatLocalDate(firstDay))
    setToDate(formatLocalDate(lastDay))
  }

  const handleExecuteRange = async () => {
    if (!fromDate || !toDate) return
    setIsRunningNow(true)
    setRunMessage(null)
    try {
      const result = await api.triggerRunNow(fromDate, toDate)
      await loadHistory()
      const updatedConfig = await api.getSchedulerConfig()
      setScheduler(updatedConfig)
      setRunMessage(result.message || 'Process executed successfully.')
      setTimeout(() => {
        setIsRunModalOpen(false)
        setRunMessage(null)
      }, 1800)
    } catch (err: unknown) {
      console.error('Failed to trigger run now:', err)
      const errorMsg = err instanceof Error ? err.message : 'Unknown execution error'
      setRunMessage(`Execution error: ${errorMsg}`)
      await loadHistory()
    } finally {
      setIsRunningNow(false)
    }
  }

  const formatTo12Hour = (timeStr?: string) => {
    if (!timeStr) return '02:00 AM'
    const [hoursStr, minutesStr] = timeStr.split(':')
    const hours = parseInt(hoursStr, 10)
    const minutes = minutesStr || '00'
    if (isNaN(hours)) return timeStr
    const period = hours >= 12 ? 'PM' : 'AM'
    const displayHours = hours % 12 || 12
    return `${displayHours.toString().padStart(2, '0')}:${minutes} ${period}`
  }

  const formatNextRun = (isoString?: string | null) => {
    if (!isoString) return 'Not scheduled'
    try {
      const d = new Date(isoString)
      const now = new Date()
      const isToday = d.toDateString() === now.toDateString()
      const timePart = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
      return isToday ? `Today, ${timePart}` : `Tomorrow, ${timePart}`
    } catch {
      return isoString
    }
  }

  const formatWeeklyNextRun = (isoString?: string | null) => {
    if (!isoString) return 'Not scheduled'
    try {
      const d = new Date(isoString)
      const datePart = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      const timePart = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
      return `${datePart} at ${timePart}`
    } catch {
      return isoString
    }
  }

  const isWeeklyTrigger = (trigger?: string) => {
    if (!trigger) return false
    return trigger.toLowerCase().includes('weekly')
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

  const calculateDaysCount = () => {
    if (!fromDate || !toDate) return 1
    const from = parseLocalDate(fromDate)
    const to = parseLocalDate(toDate)
    const diffTime = Math.abs(to.getTime() - from.getTime())
    return Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1
  }

  return (
    <div className="space-y-6 w-full">
      {/* Page Title Header */}
      <div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Auto Process
          </h1>
          <Badge variant="outline" className="text-xs font-semibold px-2.5 py-0.5 text-blue-700 border-blue-300 bg-blue-50">
            Entry = 4
          </Badge>
        </div>
        <p className="text-slate-600 text-sm sm:text-base font-normal mt-1">
          Set the daily time to automatically run the process in the background. In this automated process, employee entry is considered as 4 (Entry 4) to automatically process attendance data.
        </p>
      </div>

      {/* 0. Autonomous 24/7 Background Service Live Status Banner */}
      <div className="p-3.5 sm:p-4 rounded-xl bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white shadow-xs border border-blue-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-blue-500/20 border border-blue-400/30 flex items-center justify-center shrink-0">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm sm:text-base font-bold text-white tracking-tight">
                Autonomous 24/7 Background Service Active
              </span>
              <span className="text-2xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                Always Running
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 font-normal mt-0.5">
              Scheduled daily shift and weekly processes execute directly on the backend server. The web browser does not need to stay open.
            </p>
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2 self-start sm:self-auto text-xs font-semibold text-blue-200 bg-white/10 px-3 py-1.5 rounded-lg border border-white/10">
          <Clock className="h-3.5 w-3.5 text-blue-300" />
          <span>Server Worker Standby</span>
        </div>
      </div>

      {/* 1. Automated Shift Schedules Box (Multi-Time + Night Shift 2-Day Support) */}
      <Card className="border border-slate-200/90 bg-white shadow-xs rounded-xl overflow-hidden w-full">
        <CardHeader className="p-5 pb-4 border-b border-slate-100">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="h-10 w-10 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold shadow-2xs shrink-0">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle className="text-lg sm:text-xl font-bold text-slate-900">
                    Automated Shift Schedules
                  </CardTitle>
                  <Badge variant="outline" className="text-xs font-semibold bg-blue-50 text-blue-700 border-blue-200 shrink-0">
                    {schedules.filter(s => s.isEnabled).length} / 4 Active Shifts
                  </Badge>
                </div>
                <CardDescription className="text-slate-500 text-xs sm:text-sm font-normal mt-0.5">
                  Configure 4 daily automated execution times with 6-hour intervals (Night, Morning, Evening, and Midnight).
                </CardDescription>
              </div>
            </div>

            {/* Right Action Controls: Clean side-by-side single row alignment */}
            <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap sm:flex-nowrap justify-start xl:justify-end shrink-0">
              {scheduler?.nextRunTime ? (
                <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-blue-50/80 border border-blue-200/90 text-blue-950 text-xs sm:text-sm font-semibold whitespace-nowrap shadow-2xs">
                  <span className="text-slate-500 font-medium">Next Upcoming:</span>
                  <span className="font-bold text-blue-900">{formatNextRun(scheduler.nextRunTime)}</span>
                  {scheduler.nextRunLabel && (
                    <span className="text-blue-700 font-semibold">({scheduler.nextRunLabel})</span>
                  )}
                  {scheduler.nextRunIsNightShift && (
                    <span className="px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-800 text-2xs font-bold uppercase tracking-wider">
                      🌙 2-Day
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-50/80 border border-amber-200/90 text-amber-950 text-xs sm:text-sm font-semibold whitespace-nowrap shadow-2xs">
                  <span className="text-amber-800 font-semibold">⚠️ All Shifts Paused</span>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setRunMessage(null)
                  setIsRunModalOpen(true)
                }}
                disabled={scheduler?.isExecuting}
                className="h-10 px-4.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs flex items-center gap-2 cursor-pointer transition-all border border-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
              >
                <Play className="h-4 w-4 text-white fill-white shrink-0" />
                <span>Run Process Now</span>
              </button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-5 space-y-4">
          {/* Shift Slot Cards Grid: 4 Equal Columns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
            {schedules.map((slot, idx) => (
              <div
                key={slot.id || idx}
                className={`p-4 rounded-xl border transition-all ${
                  slot.isEnabled
                    ? slot.isNightShift
                      ? 'bg-gradient-to-b from-indigo-50/50 to-white border-indigo-200/90 shadow-2xs'
                      : 'bg-gradient-to-b from-blue-50/40 to-white border-slate-200/90 shadow-2xs'
                    : 'bg-slate-50/80 border-slate-200 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-base shrink-0">
                      {idx === 0 ? '🌙' : idx === 1 ? '☀️' : idx === 2 ? '🌇' : '🌃'}
                    </span>
                    <span className="text-sm font-bold text-slate-900 truncate">
                      {idx === 0 ? 'Night Shift' : idx === 1 ? 'Morning Shift' : idx === 2 ? 'Evening Shift' : 'Midnight Shift'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleEnabled(idx)}
                      title={slot.isEnabled ? 'Active (Click to pause)' : 'Paused (Click to activate)'}
                      className={`text-2xs font-bold px-2.5 py-1 rounded cursor-pointer transition-colors ${
                        slot.isEnabled
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {slot.isEnabled ? 'ACTIVE' : 'PAUSED'}
                    </button>
                  </div>
                </div>

                {/* Time Picker & 12hr Preview */}
                <div className="flex items-center gap-2.5 mb-3">
                  <input
                    type="time"
                    value={slot.time}
                    onChange={(e) => handleSlotTimeChange(idx, e.target.value)}
                    disabled={!slot.isEnabled}
                    className="h-10 px-3 text-base font-semibold font-mono text-slate-900 bg-white border border-slate-300 rounded-lg shadow-2xs focus:border-blue-600 focus:outline-none transition-colors cursor-pointer w-32"
                  />
                  <span className="text-xs sm:text-sm font-bold text-slate-700">
                    {formatTo12Hour(slot.time)}
                  </span>
                </div>

                {/* Shift Type Info (Toggleable: Day Shift vs Night Shift 2-Days) */}
                <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => handleToggleNightShift(idx)}
                    title="Click to toggle between 2-Day (Yesterday & Today) and 1-Day (Today Only)"
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                      slot.isNightShift
                        ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    <span>{slot.isNightShift ? '🌙 2 Days' : '☀️ 1 Day'}</span>
                  </button>

                  <span className="text-2xs text-slate-500 font-medium">
                    {slot.isNightShift ? 'Yesterday & Today' : 'Today Only'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Action Row: Save All Schedules */}
          <div className="flex items-center justify-end pt-2">
            <Button
              type="button"
              onClick={handleSaveAllSchedules}
              disabled={isSaving || isLoading}
              className="h-10 px-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs sm:text-sm rounded-lg shadow-2xs flex items-center gap-2 cursor-pointer transition-all"
            >
              <Save className={`h-4 w-4 ${isSaving ? 'animate-spin' : ''}`} />
              <span>{isSaving ? 'Saving Schedules...' : 'Save Shift Timings'}</span>
            </Button>
          </div>

          {/* Feedback message */}
          {isSaved && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs sm:text-sm font-semibold text-emerald-800 animate-in fade-in">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>All shift timings successfully updated and saved to scheduler-config.json. Backend is active.</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. Automated Weekly Schedule Card (8 Days Processing) */}
      <Card className="border border-indigo-200/90 bg-white shadow-xs rounded-xl overflow-hidden w-full">
        <CardHeader className="p-5 pb-4 border-b border-indigo-100 bg-gradient-to-r from-indigo-50/50 via-white to-blue-50/30">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="h-10 w-10 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold shadow-2xs shrink-0">
                <Calendar className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle className="text-lg sm:text-xl font-bold text-slate-900">
                    Automated Weekly Schedule
                  </CardTitle>
                  <Badge variant="outline" className={`text-xs font-semibold shrink-0 ${weeklySchedule.isEnabled ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-slate-100 text-slate-600 border-slate-300'}`}>
                    {weeklySchedule.isEnabled ? 'Active Weekly' : 'Paused'}
                  </Badge>
                  <Badge variant="outline" className="text-xs font-semibold bg-indigo-50 text-indigo-700 border-indigo-200 shrink-0">
                    8 Days Processing
                  </Badge>
                </div>
                <CardDescription className="text-slate-500 text-xs sm:text-sm font-normal mt-0.5">
                  Configure weekly automated execution on a selected day and time, processing 8 days of data (today + previous 7 days).
                </CardDescription>
              </div>
            </div>

            {/* Right Status Badge (Run button removed per user request) */}
            <div className="flex items-center gap-2.5 shrink-0">
              {weeklySchedule.isEnabled && scheduler?.nextWeeklyRunTime ? (
                <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-50/80 border border-indigo-200/90 text-indigo-950 text-xs sm:text-sm font-semibold whitespace-nowrap shadow-2xs">
                  <span className="text-slate-500 font-medium">Next Weekly Run:</span>
                  <span className="font-bold text-indigo-900">{formatWeeklyNextRun(scheduler.nextWeeklyRunTime)}</span>
                  <span className="px-1.5 py-0.5 rounded-md bg-purple-100 text-purple-800 text-2xs font-bold uppercase tracking-wider">
                    8 Days
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 text-xs sm:text-sm font-semibold whitespace-nowrap shadow-2xs">
                  <span className="text-slate-600 font-semibold">⏸️ Weekly Schedule Paused</span>
                </div>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-5 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-start">
            {/* Day of Week Selector: 7 clean single-line pills */}
            <div className="lg:col-span-6 space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                  Execution Day of Week
                </label>
                <span className="text-xs font-bold text-indigo-600">
                  {weeklySchedule.dayOfWeek}
                </span>
              </div>
              <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => {
                  const isSelected = weeklySchedule.dayOfWeek.toLowerCase() === day.toLowerCase()
                  const shortDay = day.slice(0, 3)
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => handleWeeklyDayChange(day)}
                      title={day}
                      className={`h-11 rounded-lg text-xs sm:text-sm font-bold border transition-all cursor-pointer flex items-center justify-center whitespace-nowrap select-none ${
                        isSelected
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs ring-2 ring-indigo-300 font-extrabold'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 font-semibold'
                      }`}
                    >
                      {shortDay}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Execution Time Picker */}
            <div className="lg:col-span-3 space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                Scheduled Time
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="time"
                  value={weeklySchedule.time}
                  onChange={(e) => handleWeeklyTimeChange(e.target.value)}
                  className="h-11 px-3 text-base font-semibold font-mono text-slate-900 bg-white border border-slate-300 rounded-lg shadow-2xs focus:border-indigo-600 focus:outline-none transition-colors cursor-pointer w-32 shrink-0"
                />
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-bold text-slate-800 leading-tight">
                    {formatTo12Hour(weeklySchedule.time)}
                  </span>
                  <span className="text-2xs text-slate-500 font-medium truncate mt-0.5">
                    Every {weeklySchedule.dayOfWeek}
                  </span>
                </div>
              </div>
            </div>

            {/* Status Toggle */}
            <div className="lg:col-span-3 space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                Schedule Status
              </label>
              <button
                type="button"
                onClick={handleToggleWeeklyEnabled}
                className={`h-11 w-full px-4 font-bold text-xs sm:text-sm rounded-lg cursor-pointer transition-all border flex items-center justify-center gap-2 ${
                  weeklySchedule.isEnabled
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200'
                    : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                }`}
              >
                <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${weeklySchedule.isEnabled ? 'bg-emerald-600 animate-pulse' : 'bg-slate-400'}`}></span>
                <span>{weeklySchedule.isEnabled ? 'ACTIVE' : 'PAUSED'}</span>
              </button>
            </div>
          </div>

          {/* 8 Days Data Explanation Banner */}
          <div className="p-3.5 rounded-xl bg-gradient-to-r from-indigo-50/70 to-purple-50/60 border border-indigo-200/80 text-indigo-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs sm:text-sm shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="text-base shrink-0">📆</span>
              <span>
                <strong className="font-bold text-indigo-950">8 Days Continuous Coverage:</strong> Every{' '}
                <strong className="text-indigo-900">{weeklySchedule.dayOfWeek}</strong> at{' '}
                <strong className="text-indigo-900">{formatTo12Hour(weeklySchedule.time)}</strong>, the process automatically processes{' '}
                <strong>8 calendar days</strong>: {weeklySchedule.dayOfWeek} of that day and previous 7 days ({weeklySchedule.dayOfWeek} to Sunday).
              </span>
            </div>
            <span className="px-2.5 py-1 rounded-md bg-indigo-100 text-indigo-900 font-bold text-2xs uppercase tracking-wider shrink-0 self-start sm:self-center">
              Entry 4 Attendance
            </span>
          </div>

          {/* Action Row: Dedicated Save Weekly Schedule (Matches Save Shift Timings) */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
            <div>
              {isSavedWeekly && (
                <div className="p-2.5 px-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-xs sm:text-sm font-semibold text-emerald-800 animate-in fade-in">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Weekly schedule successfully updated and saved. Backend is active.</span>
                </div>
              )}
            </div>

            <Button
              type="button"
              onClick={handleSaveWeeklySchedule}
              disabled={isSavingWeekly || isLoading}
              className="h-10 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs sm:text-sm rounded-lg shadow-2xs flex items-center justify-center gap-2 cursor-pointer transition-all self-end shrink-0 ml-auto"
            >
              <Save className={`h-4 w-4 ${isSavingWeekly ? 'animate-spin' : ''}`} />
              <span>{isSavingWeekly ? 'Saving Weekly Schedule...' : 'Save Weekly Schedule'}</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Date Range Selection Modal with shadcn Calendar DatePicker */}
      {isRunModalOpen && (
        <div
          className="fixed inset-0 z-50 w-screen h-screen min-w-full min-h-full bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto cursor-pointer"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isRunningNow) {
              setIsRunModalOpen(false)
            }
          }}
        >
          <div
            className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-lg w-full overflow-visible relative animate-in fade-in zoom-in-95 duration-150 cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/90 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-2xs shrink-0">
                  <Play className="h-4 w-4 fill-white" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900">
                    Run Attendance Process
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-500 font-normal">
                    Select the date range to process attendance on WebmisDB.
                  </p>
                </div>
              </div>
              <button
                onClick={() => !isRunningNow && setIsRunModalOpen(false)}
                disabled={isRunningNow}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-200/60 cursor-pointer transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 overflow-visible">
              {/* Quick Presets */}
              <div>
                <label className="block text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Quick Presets
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handlePresetToday}
                    disabled={isRunningNow}
                    className="px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 text-slate-700 hover:text-blue-700 cursor-pointer transition-colors"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={handlePresetYesterday}
                    disabled={isRunningNow}
                    className="px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 text-slate-700 hover:text-blue-700 cursor-pointer transition-colors"
                  >
                    Yesterday
                  </button>
                  <button
                    type="button"
                    onClick={handlePresetLast7Days}
                    disabled={isRunningNow}
                    className="px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 text-slate-700 hover:text-blue-700 cursor-pointer transition-colors"
                  >
                    Last 7 Days
                  </button>
                  <button
                    type="button"
                    onClick={handlePresetWeekly8Days}
                    disabled={isRunningNow}
                    className="px-3.5 py-1.5 text-xs sm:text-sm font-bold rounded-lg border border-indigo-200 bg-indigo-50/90 hover:bg-indigo-100 text-indigo-800 cursor-pointer transition-colors"
                  >
                    Weekly (8 Days)
                  </button>
                  <button
                    type="button"
                    onClick={handlePresetThisMonth}
                    disabled={isRunningNow}
                    className="px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg border border-blue-200 bg-blue-50/90 hover:bg-blue-100 text-blue-800 cursor-pointer transition-colors"
                  >
                    This Month
                  </button>
                  <button
                    type="button"
                    onClick={handlePresetPrevMonth}
                    disabled={isRunningNow}
                    className="px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg border border-purple-200 bg-purple-50/90 hover:bg-purple-100 text-purple-800 cursor-pointer transition-colors"
                  >
                    Previous Month
                  </button>
                </div>
              </div>

              {/* Selected Range Summary Banner */}
              <div className="p-3.5 bg-blue-50/70 border border-blue-200/90 rounded-xl flex items-center justify-between text-xs sm:text-sm font-semibold text-blue-950">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-blue-600 shrink-0" />
                  <span>{formatDisplayDate(fromDate)}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                  <span>{formatDisplayDate(toDate)}</span>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-blue-200/80 text-blue-900 text-xs font-bold shrink-0">
                  {calculateDaysCount()} {calculateDaysCount() === 1 ? 'day' : 'days'}
                </span>
              </div>

              {/* shadcn Calendar DatePickers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 relative">
                <div>
                  <DatePicker
                    label="From Date"
                    value={fromDate}
                    onChange={(val) => {
                      setFromDate(val)
                      if (toDate < val) setToDate(val)
                    }}
                    disabled={isRunningNow}
                    align="left"
                  />
                </div>

                <div>
                  <DatePicker
                    label="To Date"
                    value={toDate}
                    onChange={(val) => {
                      setToDate(val)
                      if (fromDate > val) setFromDate(val)
                    }}
                    disabled={isRunningNow}
                    align="right"
                  />
                </div>
              </div>

              {/* Status / Feedback Banner */}
              {isRunningNow && (
                <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 flex items-center gap-2.5 text-xs sm:text-sm font-semibold animate-pulse">
                  <RefreshCw className="h-4 w-4 animate-spin text-blue-600 shrink-0" />
                  <span>Processing attendance from {fromDate} to {toDate} on WebmisDB...</span>
                </div>
              )}

              {runMessage && !isRunningNow && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center gap-2 text-xs sm:text-sm font-semibold">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>{runMessage}</span>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5 rounded-b-2xl">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsRunModalOpen(false)}
                disabled={isRunningNow}
                className="h-10 px-4 border border-slate-300 text-slate-700 font-semibold text-xs sm:text-sm rounded-lg cursor-pointer hover:bg-slate-100"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleExecuteRange}
                disabled={isRunningNow || !fromDate || !toDate}
                className="h-10 px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs sm:text-sm rounded-lg shadow-2xs flex items-center gap-2 cursor-pointer transition-all"
              >
                <Play className={`h-4 w-4 ${isRunningNow ? 'animate-spin' : 'fill-white'}`} />
                <span>{isRunningNow ? 'Executing...' : 'Execute Process Range'}</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Top 50 Execution Logs Table with Differentiated Colors for Manual vs Automated */}
      <Card className="border border-slate-200/90 bg-white shadow-xs rounded-xl overflow-hidden w-full">
        <CardHeader className="p-4 sm:p-5 pb-3.5 border-b border-slate-200 bg-slate-50/60">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
            <div>
              <div className="flex items-center gap-2.5">
                <CardTitle className="text-lg sm:text-xl font-bold text-slate-900">
                  Execution History Logs
                </CardTitle>
                <Badge variant="outline" className="text-xs sm:text-sm font-semibold bg-white text-slate-600 border-slate-300">
                  Top 50 Days
                </Badge>
              </div>
              <CardDescription className="text-slate-500 text-xs sm:text-sm font-normal mt-0.5">
                Audit trail of automated daily scheduled runs and manual process executions.
              </CardDescription>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
              {/* Color Differentiated Filter / Legend */}
              <div className="inline-flex items-center p-1 bg-slate-200/80 rounded-lg text-xs font-semibold shadow-2xs">
                <button
                  type="button"
                  onClick={() => setHistoryFilter('all')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    historyFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All ({history.length})
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryFilter('automated')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                    historyFilter === 'automated'
                      ? 'bg-blue-600 text-white shadow-2xs font-bold'
                      : 'text-blue-700 hover:text-blue-900'
                  }`}
                >
                  <Bot className="h-3.5 w-3.5" />
                  <span>Automated ({history.filter(h => isAutomatedTrigger(h.triggerSource)).length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryFilter('manual')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                    historyFilter === 'manual'
                      ? 'bg-amber-600 text-white shadow-2xs font-bold'
                      : 'text-amber-800 hover:text-amber-950'
                  }`}
                >
                  <User className="h-3.5 w-3.5" />
                  <span>Manual ({history.filter(h => !isAutomatedTrigger(h.triggerSource)).length})</span>
                </button>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={loadHistory}
                disabled={isRefreshingHistory}
                className="self-start sm:self-auto h-9 px-3.5 text-xs sm:text-sm font-semibold border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer flex items-center gap-1.5"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshingHistory ? 'animate-spin text-blue-600' : ''}`} />
                <span>Refresh Logs</span>
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {history.length === 0 ? (
            <div className="py-12 text-center text-slate-500 space-y-2">
              <Timer className="h-8 w-8 text-slate-400 mx-auto" />
              <p className="text-sm sm:text-base font-semibold text-slate-700">No execution records logged yet</p>
              <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto">
                Once the scheduled daily time is reached or you click "Run Process Now", execution records will appear here.
              </p>
            </div>
          ) : (() => {
            const automatedCount = history.filter(h => isAutomatedTrigger(h.triggerSource)).length
            const manualCount = history.length - automatedCount
            const filteredHistory = history.filter(item => {
              if (historyFilter === 'automated') return isAutomatedTrigger(item.triggerSource)
              if (historyFilter === 'manual') return !isAutomatedTrigger(item.triggerSource)
              return true
            })

            return (
              <div className="w-full overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm table-auto">
                  <thead className="border-l-4 border-l-transparent">
                    <tr className="border-b border-slate-200 bg-slate-100/90 text-slate-600 font-bold uppercase text-xs tracking-wider divide-x divide-slate-200">
                      <th className="py-3.5 px-3 sm:px-4 whitespace-nowrap w-[170px]">Date Processed</th>
                      <th className="py-3.5 px-3 sm:px-4 whitespace-nowrap w-[170px]">Run Timestamp</th>
                      <th className="py-3.5 px-2.5 sm:px-3 whitespace-nowrap text-center w-[100px]">Status</th>
                      <th className="py-3.5 px-2.5 sm:px-3 whitespace-nowrap text-right w-[95px]">Duration</th>
                      <th className="py-3.5 px-3 sm:px-4 whitespace-nowrap w-[180px]">MonthTrns Records</th>
                      <th className="py-3.5 px-3 sm:px-4 w-[280px]">Trigger Type</th>
                      <th className="py-3.5 px-3 sm:px-4 w-[310px] max-w-[360px]">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white font-normal">
                    {filteredHistory.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-10 text-center text-slate-500">
                          <p className="text-sm font-semibold">No records found for the "{historyFilter}" filter</p>
                          <button
                            type="button"
                            onClick={() => setHistoryFilter('all')}
                            className="mt-2 text-xs font-bold text-blue-600 hover:underline cursor-pointer"
                          >
                            Show all records
                          </button>
                        </td>
                      </tr>
                    ) : (
                      filteredHistory.map((item) => {
                        const isSuccess = item.status === 'Success'
                        const isAuto = isAutomatedTrigger(item.triggerSource)
                        const isWeekly = isWeeklyTrigger(item.triggerSource)

                        return (
                          <tr
                            key={item.id}
                            className={`divide-x divide-slate-200 transition-colors ${
                              isWeekly
                                ? 'border-l-4 border-l-indigo-600 bg-indigo-50/15 hover:bg-indigo-50/35'
                                : isAuto
                                ? 'border-l-4 border-l-blue-600 bg-blue-50/15 hover:bg-blue-50/40'
                                : 'border-l-4 border-l-amber-500 bg-amber-50/15 hover:bg-amber-50/40'
                            }`}
                          >
                            {/* Process Date */}
                            <td className="py-3.5 px-3 sm:px-4 font-semibold text-slate-900 whitespace-nowrap text-sm w-[170px]">
                              <div className="flex items-center gap-1.5">
                                {isWeekly ? (
                                  <Calendar className="h-4 w-4 text-indigo-600 shrink-0" />
                                ) : isAuto ? (
                                  <Clock className="h-4 w-4 text-blue-600 shrink-0" />
                                ) : (
                                  <Calendar className="h-4 w-4 text-amber-600 shrink-0" />
                                )}
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
                              <div className="inline-flex items-center gap-1.5 text-sm font-semibold">
                                <span
                                  className={`px-2.5 py-0.5 rounded-md font-semibold border ${
                                    isWeekly
                                      ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                      : isAuto
                                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                                      : 'bg-amber-50 text-amber-800 border-amber-200'
                                  }`}
                                >
                                  {item.rowsUpdated} updated
                                </span>
                                <span className="px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                                  {item.rowsInserted} inserted
                                </span>
                              </div>
                            </td>

                            {/* Trigger Source - Differentiated with Colors & Icons */}
                            <td className="py-3.5 px-3 sm:px-4 text-slate-700 text-sm w-[280px]">
                              {isWeekly ? (
                                <div className="p-2 rounded-lg bg-indigo-50/90 border border-indigo-200/90 text-indigo-950 flex flex-col gap-1 shadow-2xs">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs font-extrabold uppercase tracking-wider bg-indigo-600 text-white shadow-2xs">
                                      <Bot className="h-3 w-3" />
                                      Automated
                                    </span>
                                    <span className="text-2xs font-bold text-indigo-700 bg-indigo-100/70 px-1.5 py-0.5 rounded">
                                      Weekly Schedule
                                    </span>
                                    <span className="text-2xs font-bold text-purple-800 bg-purple-100 px-1.5 py-0.5 rounded">
                                      8 Days
                                    </span>
                                  </div>
                                  <div className="text-xs font-semibold text-indigo-900 leading-snug break-words">
                                    {item.triggerSource}
                                  </div>
                                </div>
                              ) : isAuto ? (
                                <div className="p-2 rounded-lg bg-blue-50/90 border border-blue-200/90 text-blue-950 flex flex-col gap-1 shadow-2xs">
                                  <div className="flex items-center gap-1.5">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs font-extrabold uppercase tracking-wider bg-blue-600 text-white shadow-2xs">
                                      <Bot className="h-3 w-3" />
                                      Automated
                                    </span>
                                    <span className="text-2xs font-semibold text-blue-700">Daily Schedule</span>
                                  </div>
                                  <div className="text-xs font-semibold text-blue-900 leading-snug break-words">
                                    {item.triggerSource}
                                  </div>
                                </div>
                              ) : (
                                <div className="p-2 rounded-lg bg-amber-50/90 border border-amber-200/90 text-amber-950 flex flex-col gap-1 shadow-2xs">
                                  <div className="flex items-center gap-1.5">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs font-extrabold uppercase tracking-wider bg-amber-600 text-white shadow-2xs">
                                      <User className="h-3 w-3" />
                                      Manual Run
                                    </span>
                                    <span className="text-2xs font-semibold text-amber-800">On-Demand</span>
                                  </div>
                                  <div className="text-xs font-semibold text-amber-900 leading-snug break-words">
                                    {item.triggerSource}
                                  </div>
                                </div>
                              )}
                            </td>

                            {/* Message / Details */}
                            <td className="py-3.5 px-3 sm:px-4 text-slate-700 text-sm w-[310px] max-w-[360px]">
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
                      })
                    )}
                  </tbody>
                </table>

                {/* Table Footer Status */}
                <div className="py-3.5 px-4 sm:px-5 border-t border-slate-200 bg-slate-50/80 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs sm:text-sm text-slate-600 font-medium">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span>
                      Showing {filteredHistory.length} of {history.length} execution record{history.length === 1 ? '' : 's'}
                    </span>
                    <span className="text-slate-300">|</span>
                    <span className="inline-flex items-center gap-1.5 text-blue-700 font-semibold">
                      <span className="h-2 w-2 rounded-full bg-blue-600"></span>
                      {automatedCount} Automated
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-amber-700 font-semibold">
                      <span className="h-2 w-2 rounded-full bg-amber-600"></span>
                      {manualCount} Manual
                    </span>
                  </div>
                  <span className="flex items-center gap-1.5 text-slate-700 font-semibold">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    Autonomous 24/7 background scheduler active
                  </span>
                </div>
              </div>
            )
          })()}
        </CardContent>
      </Card>
    </div>
  )
}
