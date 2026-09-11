export interface HealthStatus {
  message?: string
  status: string
  timestamp: string
}

export interface SchedulerStatusDto {
  dailyTime: string
  isEnabled: boolean
  nextRunTime: string | null
  lastRunTime: string | null
  lastRunStatus: string
  lastRunMessage: string
  lastRunDurationMs: number
  isExecuting: boolean
  workerMode: string
}

export const api = {
  async getHealth(): Promise<HealthStatus> {
    const res = await fetch('/api/health')
    if (!res.ok) throw new Error(`Health check failed: ${res.statusText}`)
    return res.json()
  },

  async getSchedulerConfig(): Promise<SchedulerStatusDto> {
    const res = await fetch('/api/scheduler/config')
    if (!res.ok) throw new Error(`Failed to get scheduler config: ${res.statusText}`)
    return res.json()
  },

  async updateSchedulerConfig(dailyTime: string, isEnabled = true): Promise<SchedulerStatusDto> {
    const res = await fetch('/api/scheduler/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dailyTime, isEnabled })
    })
    if (!res.ok) throw new Error(`Failed to update scheduler config: ${res.statusText}`)
    return res.json()
  },

  async triggerRunNow(): Promise<SchedulerStatusDto> {
    const res = await fetch('/api/scheduler/run-now', { method: 'POST' })
    if (!res.ok) throw new Error(`Failed to trigger process run: ${res.statusText}`)
    return res.json()
  }
}

