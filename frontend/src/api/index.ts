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

export interface WeeklyScheduleSlot {
  id: string
  label: string
  dayOfWeek: string // 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday'
  time: string      // HH:mm 24-hr
  isEnabled: boolean
  daysCount: number // 8 days
}

export interface SchedulerStatusDto {
  schedules?: ScheduledTimeSlot[]
  weeklySchedule?: WeeklyScheduleSlot
  dailyTime: string
  isEnabled: boolean
  nextRunTime: string | null
  nextRunLabel?: string | null
  nextRunIsNightShift?: boolean | null
  nextWeeklyRunTime?: string | null
  nextWeeklyRunDay?: string | null
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

export interface ManualHistoryItem {
  id: string
  processDate: string
  executedAt: string
  status: 'Success' | 'Failed'
  durationMs: number
  rowsUpdated: number
  triggerSource: string
  message: string
  errorMessage?: string | null
}

export interface UserProfile {
  email: string
  name: string
}

export interface LoginResponse {
  success: boolean
  token: string
  user: UserProfile
  message?: string
}

// Session Helpers (sessionStorage ensures session ends on tab/browser close)
export const getAuthToken = (): string | null => {
  try {
    return sessionStorage.getItem('kota_auth_token')
  } catch {
    return null
  }
}

export const getAuthUser = (): UserProfile | null => {
  try {
    const data = sessionStorage.getItem('kota_auth_user')
    return data ? JSON.parse(data) : null
  } catch {
    return null
  }
}

export const setAuthSession = (token: string, user: UserProfile) => {
  try {
    sessionStorage.setItem('kota_auth_token', token)
    sessionStorage.setItem('kota_auth_user', JSON.stringify(user))
  } catch {
    // ignore
  }
}

export const clearAuthSession = () => {
  try {
    sessionStorage.removeItem('kota_auth_token')
    sessionStorage.removeItem('kota_auth_user')
  } catch {
    // ignore
  }
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

  async login(email: string, password: string): Promise<LoginResponse> {
    const res = await fetch(`/api/auth/login?_t=${Date.now()}`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      body: JSON.stringify({ email, password })
    })
    const data = await res.json()
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Invalid email or password.')
    }
    setAuthSession(data.token, data.user)
    return data
  },

  async logout(email?: string): Promise<void> {
    const user = getAuthUser()
    const targetEmail = email || user?.email || ''
    try {
      await fetch(`/api/auth/logout?_t=${Date.now()}`, {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        body: JSON.stringify({ email: targetEmail })
      })
    } catch {
      // ignore network errors on logout
    } finally {
      clearAuthSession()
    }
  },

  async getMe(): Promise<UserProfile | null> {
    const token = getAuthToken()
    if (!token) return null
    try {
      const res = await fetch(`/api/auth/me?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      })
      if (!res.ok) {
        clearAuthSession()
        return null
      }
      return res.json()
    } catch {
      return null
    }
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
    schedules?: ScheduledTimeSlot[],
    weeklySchedule?: WeeklyScheduleSlot
  ): Promise<SchedulerStatusDto> {
    const res = await fetch(`/api/scheduler/config?_t=${Date.now()}`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      body: JSON.stringify({ dailyTime, isEnabled, schedules, weeklySchedule })
    })
    if (!res.ok) throw new Error(`Failed to update scheduler config: ${res.statusText}`)
    return res.json()
  },

  async triggerWeeklyRunNow(dayOfWeek?: string): Promise<ProcessHistoryItem> {
    const res = await fetch(`/api/scheduler/run-weekly?_t=${Date.now()}`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      body: JSON.stringify({ dayOfWeek })
    })
    if (!res.ok) throw new Error(`Failed to trigger weekly process run: ${res.statusText}`)
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
  },

  async getManualSwappingHistory(): Promise<ManualHistoryItem[]> {
    const res = await fetch(`/api/manual-swapping/history?_t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
    })
    if (!res.ok) throw new Error(`Failed to get manual swapping history: ${res.statusText}`)
    return res.json()
  },

  async executeManualSwapping(fromDate: string, toDate: string): Promise<ManualHistoryItem> {
    const res = await fetch(`/api/manual-swapping/execute?_t=${Date.now()}`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      body: JSON.stringify({ fromDate, toDate })
    })
    if (!res.ok) throw new Error(`Failed to execute manual swapping: ${res.statusText}`)
    return res.json()
  }
}
