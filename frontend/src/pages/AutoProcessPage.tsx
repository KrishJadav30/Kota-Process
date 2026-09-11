import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { api, type SchedulerStatusDto } from '@/api'
import { Clock, Save, CheckCircle2 } from 'lucide-react'

export function AutoProcessPage() {
  const [scheduler, setScheduler] = useState<SchedulerStatusDto | null>(null)
  const [selectedTime, setSelectedTime] = useState<string>('02:00')
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [isSaved, setIsSaved] = useState<boolean>(false)

  useEffect(() => {
    let isMounted = true

    async function init() {
      try {
        const data = await api.getSchedulerConfig()
        if (isMounted) {
          setScheduler(data)
          if (data.dailyTime) {
            setSelectedTime(data.dailyTime)
          }
        }
      } catch (err) {
        console.warn('Failed to load scheduler config:', err)
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

  const handleSaveSchedule = async () => {
    if (!selectedTime) return
    setIsSaving(true)
    setIsSaved(false)
    try {
      const updated = await api.updateSchedulerConfig(selectedTime, true)
      setScheduler(updated)
      setIsSaved(true)
      setTimeout(() => setIsSaved(false), 4000)
    } catch (err) {
      console.error('Failed to save schedule time:', err)
    } finally {
      setIsSaving(false)
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

  return (
    <div className="space-y-6">
      {/* Page Title Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-950 tracking-tight">
          Auto Process
        </h1>
        <p className="text-slate-600 text-sm font-medium mt-1">
          Set the daily time to automatically run the process in the background.
        </p>
      </div>

      {/* Single Clean Time Configuration Box */}
      <Card className="border-2 border-slate-200 bg-white shadow-xs rounded-2xl overflow-hidden">
        <CardHeader className="pb-4 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-xs">
                <Clock className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-lg sm:text-xl font-extrabold text-slate-950">
                  Daily Execution Time
                </CardTitle>
                <CardDescription className="text-slate-500 text-xs font-medium">
                  Runs once daily at this specified time in the background.
                </CardDescription>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <span className="text-xs font-bold text-slate-500">Active Schedule:</span>
              <span className="inline-flex items-center px-3 py-1 rounded-lg bg-blue-50 border border-blue-300 text-blue-900 font-extrabold text-sm shadow-2xs">
                {formatTo12Hour(scheduler?.dailyTime)} (Daily)
              </span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          <div className="p-6 rounded-xl bg-slate-50 border-2 border-slate-200 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <label className="block text-sm font-extrabold text-slate-900">
                  Daily Run Time:
                </label>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  The process will execute once every 24 hours at this exact time.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="time"
                  value={selectedTime}
                  onChange={(e) => {
                    setSelectedTime(e.target.value)
                    setIsSaved(false)
                  }}
                  className="h-11 px-4 text-base font-bold font-mono text-slate-950 bg-white border-2 border-slate-300 rounded-xl shadow-xs focus:border-blue-600 focus:outline-none transition-colors cursor-pointer"
                />

                <Button
                  onClick={handleSaveSchedule}
                  disabled={isSaving || isLoading}
                  className="h-11 px-5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-xs flex items-center gap-2 cursor-pointer transition-all"
                >
                  <Save className={`h-4 w-4 ${isSaving ? 'animate-spin' : ''}`} />
                  {isSaving ? 'Saving...' : 'Save Time'}
                </Button>
              </div>
            </div>

            {isSaved && (
              <div className="pt-3 border-t border-slate-200 flex items-center gap-2 text-xs font-bold text-emerald-800">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Daily schedule time updated to {formatTo12Hour(scheduler?.dailyTime)} and saved to server.</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
