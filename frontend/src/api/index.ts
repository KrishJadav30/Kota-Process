export interface HealthStatus {
  message?: string
  status: string
  timestamp: string
}

export interface ScheduledTimeSlot {
  id: string
  label: string
  time: string // HH:mm 24-hr
  isEnabled: boolean
  isNightShift: boolean
}

export interface SchedulerStatusDto {
  schedules?: ScheduledTimeSlot[]
  dailyTime: string
  isEnabled: boolean
  nextRunTime: string | null
  nextRunLabel?: string | null
  nextRunIsNightShift?: boolean | null
  lastRunTime: string | null
  lastRunStatus: string
  lastRunMessage: string
  lastRunDurationMs: number
  isExecuting: boolean
  workerMode: string
}

export interface ProcessHistoryItem {
  id: string
  processDate: string
  executedAt: string
  status: 'Success' | 'Failed'
  durationMs: number
  rowsUpdated: number
  rowsInserted: number
  triggerSource: string
  message: string
  errorMessage?: string | null
}

export const api = {
  async getHealth(): Promise<HealthStatus> {
    const res = await fetch(`/api/health?_t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
    })
    if (!res.ok) throw new Error(`Health check failed: ${res.statusText}`)
    return res.json()
  },

  async getSchedulerConfig(): Promise<SchedulerStatusDto> {
    const res = await fetch(`/api/scheduler/config?_t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
    })
    if (!res.ok) throw new Error(`Failed to get scheduler config: ${res.statusText}`)
    return res.json()
  },

  async updateSchedulerConfig(
    dailyTime?: string,
    isEnabled = true,
    schedules?: ScheduledTimeSlot[]
  ): Promise<SchedulerStatusDto> {
    const res = await fetch(`/api/scheduler/config?_t=${Date.now()}`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      body: JSON.stringify({ dailyTime, isEnabled, schedules })
    })
    if (!res.ok) throw new Error(`Failed to update scheduler config: ${res.statusText}`)
    return res.json()
  },

  async getProcessHistory(): Promise<ProcessHistoryItem[]> {
    const res = await fetch(`/api/scheduler/history?_t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
    })
    if (!res.ok) throw new Error(`Failed to get process history: ${res.statusText}`)
    return res.json()
  },

  async triggerRunNow(fromDate?: string, toDate?: string, targetDate?: string): Promise<ProcessHistoryItem> {
    const res = await fetch(`/api/scheduler/run-now?_t=${Date.now()}`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      body: JSON.stringify({ fromDate, toDate, targetDate })
    })
    if (!res.ok) throw new Error(`Failed to trigger process run: ${res.statusText}`)
    return res.json()
  }
}

