import React, { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { api, type AppStatus, type DbStatus } from '@/api'
import { RefreshCw } from 'lucide-react'

export function App() {
  const [appStatus, setAppStatus] = useState<AppStatus | null>(null)
  const [dbStatus, setDbStatus] = useState<DbStatus | null>(null)
  const [existingLogs, setExistingLogs] = useState<string[]>([])
  const [testingDb, setTestingDb] = useState<boolean>(false)

  const testDb = useCallback(async (server?: string, database?: string) => {
    setTestingDb(true)
    try {
      const db = await api.checkDatabase()
      setDbStatus(db)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to connect to database'
      setDbStatus({
        isConnected: false,
        message,
        server: server || '192.168.1.25',
        database: database || 'WebmisDB',
        latencyMs: 0
      })
    } finally {
      setTestingDb(false)
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    async function initialize() {
      try {
        const [statusRes, logsRes, dbRes] = await Promise.allSettled([
          api.getStatus(),
          api.getExistingLogs(),
          api.checkDatabase()
        ])

        if (!isMounted) return

        if (statusRes.status === 'fulfilled') {
          setAppStatus(statusRes.value)
        } else {
          setAppStatus(null)
        }

        if (logsRes.status === 'fulfilled') {
          setExistingLogs(logsRes.value.existingFiles || [])
        }

        if (dbRes.status === 'fulfilled') {
          setDbStatus(dbRes.value)
        }
      } catch (err) {
        console.warn('Initialization error:', err)
      }
    }

    initialize()

    return () => {
      isMounted = false
    }
  }, [])

  const isBackendOnline = appStatus !== null

  return (
    <div className="min-h-screen bg-[#f1f5f9] text-slate-950 py-10 px-4 sm:px-6 font-sans">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Main Dashboard Card */}
        <Card className="border-2 border-slate-300 bg-white shadow-lg rounded-2xl overflow-hidden">
          <CardHeader className="text-center pb-6 border-b-2 border-slate-200 bg-white">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-3xl shadow-md text-white mx-auto mb-3">
              🚀
            </div>
            <CardTitle className="text-3xl sm:text-4xl font-black justify-center tracking-tight text-slate-950">
              KOTA Process
            </CardTitle>
            <CardDescription className="text-slate-700 text-base sm:text-lg font-semibold mt-1">
              Clean full-stack foundation with React, .NET 10, MSSQL & On-Demand Monthly Logs
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-6 space-y-5 bg-white">
            {/* Status Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Backend Status */}
              <div className="p-4 rounded-xl bg-slate-50 border-2 border-slate-300 flex items-center justify-between">
                <div className="flex items-center gap-3.5">
                  <span className="text-3xl">🌐</span>
                  <div>
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wider block">
                      Backend Web API
                    </span>
                    <span className="text-base font-extrabold text-slate-950 mt-0.5 block">
                      Port: <span className="text-blue-700">{appStatus?.backendPort || 5001}</span>
                    </span>
                  </div>
                </div>
                <Badge variant={isBackendOnline ? 'success' : 'destructive'} className="text-xs px-3 py-1 font-bold">
                  {isBackendOnline ? 'Online ✅' : 'Offline ❌'}
                </Badge>
              </div>

              {/* Frontend Status */}
              <div className="p-4 rounded-xl bg-slate-50 border-2 border-slate-300 flex items-center justify-between">
                <div className="flex items-center gap-3.5">
                  <span className="text-3xl">💻</span>
                  <div>
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wider block">
                      React Frontend
                    </span>
                    <span className="text-base font-extrabold text-slate-950 mt-0.5 block">
                      Port: <span className="text-blue-700">{appStatus?.frontendPort || 5173}</span>
                    </span>
                  </div>
                </div>
                <Badge variant="success" className="text-xs px-3 py-1 font-bold">
                  Active ✅
                </Badge>
              </div>

              {/* MSSQL Database Status */}
              <div className="p-4 rounded-xl bg-slate-50 border-2 border-slate-300 flex items-center justify-between sm:col-span-2">
                <div className="flex items-center gap-3.5">
                  <span className="text-3xl">🗄️</span>
                  <div>
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wider block">
                      MSSQL Server Database
                    </span>
                    <span className="text-base font-extrabold text-slate-950 mt-0.5 block">
                      <span className="text-slate-900">{appStatus?.dbServer || '192.168.1.25'}</span>
                      <span className="text-slate-400 mx-2">/</span>
                      <span className="text-blue-700">{appStatus?.dbDatabase || 'WebmisDB'}</span>
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  {dbStatus?.isConnected ? (
                    <Badge variant="success" className="text-xs px-3 py-1 font-bold">
                      Connected ({dbStatus.latencyMs}ms) ✅
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="text-xs px-3 py-1 font-bold">
                      Disconnected ❌
                    </Badge>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testDb(appStatus?.dbServer, appStatus?.dbDatabase)}
                    disabled={testingDb}
                    className="h-9 px-3 text-xs border-2 border-slate-400 bg-white hover:bg-slate-100 text-slate-950 font-bold cursor-pointer"
                  >
                    <RefreshCw className={`h-4 w-4 ${testingDb ? 'animate-spin text-blue-600' : ''}`} />
                  </Button>
                </div>
              </div>

              {/* Monthly Rolling Logs Card */}
              <div className="p-4 rounded-xl bg-slate-50 border-2 border-slate-300 sm:col-span-2 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3.5">
                    <span className="text-3xl">📝</span>
                    <div>
                      <span className="text-xs font-bold text-slate-600 uppercase tracking-wider block">
                        Active Monthly Log File
                      </span>
                      {/* Crisp, non-blurry log file path with high contrast chip */}
                      <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-bold text-slate-600">root/logs/</span>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-blue-50 border border-blue-300 text-blue-900 font-extrabold text-sm shadow-2xs tracking-tight">
                          {appStatus?.currentLogFile || 'September_2026_logs.log'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Badge variant="success" className="text-xs px-3 py-1 font-bold">
                    Active Month ✅
                  </Badge>
                </div>

                <div className="pt-2.5 border-t border-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-800 font-medium">
                  <span>
                    <strong>On-Demand Creation:</strong> Next month's file will be automatically generated when that month arrives.
                  </span>
                  <Badge variant="outline" className="text-xs font-bold text-slate-950 self-start sm:self-auto">
                    {existingLogs.length} File on Disk
                  </Badge>
                </div>
              </div>
            </div>

            {/* Ready Callout Banner */}
            <div className="p-4 rounded-xl bg-blue-50 border-2 border-blue-400 text-center space-y-1">
              <p className="text-base sm:text-lg font-black text-blue-950">
                ☀️ Crisp Typography Initialized with Inter
              </p>
              <p className="text-sm text-blue-900 font-bold">
                Razor-sharp rendering, high-contrast badges, and dynamic .env connections ready.
              </p>
              <p className="text-xs text-slate-700 font-semibold pt-1">
                Tell me what features or UI you want to add next, and we will build them step by step!
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default App
