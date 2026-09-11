export interface AppStatus {
  status: string
  frontendPort: number
  backendPort: number
  dbServer: string
  dbDatabase: string
  logsDir: string
  currentLogFile?: string
  timestamp: string
}

export interface DbStatus {
  isConnected: boolean
  message: string
  server: string
  database: string
  latencyMs: number
}

export const api = {
  async getStatus(): Promise<AppStatus> {
    const res = await fetch('/api/status')
    if (!res.ok) throw new Error(`Backend status check failed: ${res.statusText}`)
    return res.json()
  },

  async checkDatabase(): Promise<DbStatus> {
    const res = await fetch('/api/db-check')
    if (!res.ok) throw new Error(`Database check failed: ${res.statusText}`)
    return res.json()
  },

  async getExistingLogs(): Promise<{ currentLogFile: string; existingFiles: string[] }> {
    const res = await fetch('/api/logs/files')
    if (!res.ok) throw new Error(`Failed to fetch logs: ${res.statusText}`)
    return res.json()
  }
}
