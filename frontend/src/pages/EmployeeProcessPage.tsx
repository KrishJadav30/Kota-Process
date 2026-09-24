import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DatePicker } from '@/components/ui/date-picker'
import { formatLocalDate, parseLocalDate } from '@/lib/utils'
import { api, type EmployeeItem, type LocationItem, type EmployeeProcessHistoryItem } from '@/api'
import { 
  Users, Play, CheckCircle2, AlertCircle, RefreshCw, Search, 
  CheckSquare, Square, Calendar, ArrowRight, Filter, 
  ChevronLeft, ChevronRight, Zap, ArrowLeftRight, UserCheck, Check,
  MapPin, X, ChevronDown, CheckCheck, Clock, User
} from 'lucide-react'

export function EmployeeProcessPage() {
  const [employees, setEmployees] = useState<EmployeeItem[]>([])
  const [locations, setLocations] = useState<LocationItem[]>([])
  const [isLoadingEmployees, setIsLoadingEmployees] = useState<boolean>(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Selection state
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set())

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [selectedLocations, setSelectedLocations] = useState<Set<string>>(new Set())
  const [isLocationDropdownOpen, setIsLocationDropdownOpen] = useState<boolean>(false)
  const [locationSearchQuery, setLocationSearchQuery] = useState<string>('')
  const [entryFilter, setEntryFilter] = useState<'all' | '1' | '2' | '4' | 'selected'>('all')

  // Date Range state (Default Today)
  const [fromDate, setFromDate] = useState<string>(() => formatLocalDate(new Date()))
  const [toDate, setToDate] = useState<string>(() => formatLocalDate(new Date()))

  // Target Entry Mode (2 or 4)
  const [targetEntry, setTargetEntry] = useState<2 | 4>(4)

  // Execution state
  const [isExecuting, setIsExecuting] = useState<boolean>(false)
  const [executionResult, setExecutionResult] = useState<EmployeeProcessHistoryItem | null>(null)
  const [executionError, setExecutionError] = useState<string | null>(null)

  // History state
  const [history, setHistory] = useState<EmployeeProcessHistoryItem[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false)

  // Pagination state
  const [page, setPage] = useState<number>(1)
  const [pageSize, setPageSize] = useState<number>(50)

  // Location dropdown ref for click outside
  const locationDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (locationDropdownRef.current && !locationDropdownRef.current.contains(event.target as Node)) {
        setIsLocationDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Load employees and locations from API
  const loadData = useCallback(async () => {
    setIsLoadingEmployees(true)
    setLoadError(null)
    try {
      const [empData, locData] = await Promise.all([
        api.getEmployees(),
        api.getLocations().catch(() => [] as LocationItem[])
      ])
      setEmployees(empData)
      setLocations(locData)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch data'
      setLoadError(msg)
    } finally {
      setIsLoadingEmployees(false)
    }
  }, [])

  // Load history from dedicated employee history endpoint
  const loadHistory = useCallback(async () => {
    setIsLoadingHistory(true)
    try {
      const data = await api.getEmployeeProcessHistory()
      setHistory(data)
    } catch (err) {
      console.warn('Failed to load employee process history:', err)
    } finally {
      setIsLoadingHistory(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    loadHistory()
  }, [loadData, loadHistory])

  // Filtered employees
  const filteredEmployees = useMemo(() => {
    let result = employees

    // Filter by location
    if (selectedLocations.size > 0) {
      result = result.filter(e => {
        const loc = e.location || ''
        return selectedLocations.has(loc)
      })
    }

    // Filter by entry mode
    if (entryFilter === '1') {
      result = result.filter(e => e.entry === 1)
    } else if (entryFilter === '2') {
      result = result.filter(e => e.entry === 2)
    } else if (entryFilter === '4') {
      result = result.filter(e => e.entry === 4)
    } else if (entryFilter === 'selected') {
      result = result.filter(e => selectedCodes.has(e.empCode))
    }

    // Filter by search query (empcode or name)
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase()
      result = result.filter(e => 
        e.empCode.toLowerCase().includes(query) || 
        e.name.toLowerCase().includes(query)
      )
    }

    return result
  }, [employees, selectedLocations, entryFilter, searchQuery, selectedCodes])

  // Reset to page 1 on filter or search change
  useEffect(() => {
    setPage(1)
  }, [searchQuery, selectedLocations, entryFilter])

  // Paginated employees
  const totalPages = Math.max(1, Math.ceil(filteredEmployees.length / pageSize))
  const paginatedEmployees = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredEmployees.slice(start, start + pageSize)
  }, [filteredEmployees, page, pageSize])

  // Toggle single employee
  const handleToggleEmployee = (empCode: string) => {
    setSelectedCodes(prev => {
      const next = new Set(prev)
      if (next.has(empCode)) {
        next.delete(empCode)
      } else {
        next.add(empCode)
      }
      return next
    })
  }

  // Select all filtered employees
  const handleSelectAllFiltered = () => {
    setSelectedCodes(prev => {
      const next = new Set(prev)
      filteredEmployees.forEach(e => next.add(e.empCode))
      return next
    })
  }

  // Deselect all
  const handleDeselectAll = () => {
    setSelectedCodes(new Set())
  }

  // Toggle Location filter
  const handleToggleLocation = (locCode: string) => {
    setSelectedLocations(prev => {
      const next = new Set(prev)
      if (next.has(locCode)) {
        next.delete(locCode)
      } else {
        next.add(locCode)
      }
      return next
    })
  }

  // Select all locations
  const handleSelectAllLocations = () => {
    const all = new Set(locations.map(l => l.location))
    setSelectedLocations(all)
  }

  // Clear all locations
  const handleClearLocations = () => {
    setSelectedLocations(new Set())
  }

  // Quick Preset Handlers
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

  const handlePresetThisMonth = () => {
    const now = new Date()
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
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

  // Execute processing
  const handleExecute = async () => {
    if (selectedCodes.size === 0) {
      alert('Please select at least one employee from the roster.')
      return
    }

    setIsExecuting(true)
    setExecutionResult(null)
    setExecutionError(null)

    try {
      const codes = Array.from(selectedCodes)
      const result = await api.executeEmployeeProcess({
        fromDate,
        toDate,
        targetEntry,
        empCodes: codes
      })

      setExecutionResult(result)
      await loadHistory()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown execution error'
      setExecutionError(msg)
      await loadHistory()
    } finally {
      setIsExecuting(false)
    }
  }

  const calculateDaysCount = () => {
    if (!fromDate || !toDate) return 1
    const from = parseLocalDate(fromDate)
    const to = parseLocalDate(toDate)
    const diffTime = Math.abs(to.getTime() - from.getTime())
    return Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1
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

  // Count breakdown for selected items
  const selectedCounts = useMemo(() => {
    let e1 = 0
    let e2 = 0
    let e4 = 0
    employees.forEach(emp => {
      if (selectedCodes.has(emp.empCode)) {
        if (emp.entry === 1) e1++
        else if (emp.entry === 2) e2++
        else if (emp.entry === 4) e4++
      }
    })
    return { total: selectedCodes.size, entry1: e1, entry2: e2, entry4: e4 }
  }, [employees, selectedCodes])

  // Filtered locations in dropdown
  const filteredLocationList = useMemo(() => {
    if (!locationSearchQuery.trim()) return locations
    const q = locationSearchQuery.trim().toLowerCase()
    return locations.filter(l => 
      l.location.toLowerCase().includes(q) || 
      l.locDesc.toLowerCase().includes(q)
    )
  }, [locations, locationSearchQuery])

  const areAllFilteredSelected = 
    filteredEmployees.length > 0 && 
    filteredEmployees.every(e => selectedCodes.has(e.empCode))

  return (
    <div className="space-y-6 w-full">
      {/* 1. Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              Employee Wise Process
            </h1>
            <Badge variant="outline" className="text-xs font-semibold px-2.5 py-0.5 text-blue-700 border-blue-300 bg-blue-50">
              Entry 2 / 4 Selectable
            </Badge>
            <Badge variant="outline" className="text-xs font-semibold px-2.5 py-0.5 text-amber-700 border-amber-300 bg-amber-50">
              Entry 1 Preserved
            </Badge>
          </div>
          <p className="text-slate-600 text-xs sm:text-sm md:text-base font-normal mt-1 max-w-3xl">
            Select specific employees to process punches into MonthTrns for chosen dates as Entry = 2 or Entry = 4. Employees with Entry = 1 automatically execute with their specialized rule.
          </p>
        </div>

        <div className="flex items-center gap-2.5 text-xs sm:text-sm font-semibold text-slate-700 bg-white border border-slate-200/90 px-3.5 py-2 rounded-xl shadow-2xs self-start md:self-auto shrink-0">
          <Users className="h-4 w-4 text-blue-600 shrink-0" />
          <span>Total Roster:</span>
          <span className="font-bold text-slate-900">{employees.length.toLocaleString()} Employees</span>
          <span className="h-2 w-2 rounded-full bg-emerald-500 ml-1 animate-pulse"></span>
        </div>
      </div>

      {/* 2. Interactive Batch Engine Status Banner */}
      <div className="p-3.5 sm:p-4 rounded-xl bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white shadow-xs border border-blue-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-blue-500/20 border border-blue-400/30 flex items-center justify-center shrink-0">
            <Users className="h-5 w-5 text-blue-300" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm sm:text-base font-bold text-white tracking-tight">
                Selective Employee Attendance Processing
              </span>
              <span className="text-2xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-400/30">
                Interactive Batch Engine
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 font-normal mt-0.5">
              Processes raw machine punches from Attlogs directly into MonthTrns for selected staff with slotting, presence rules, and NDA calculation.
            </p>
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2 self-start sm:self-auto text-xs font-semibold text-blue-200 bg-white/10 px-3 py-1.5 rounded-lg border border-white/10">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
          <span>WebmisDB Connected</span>
        </div>
      </div>

      {/* 3. Process Parameters & Entry Mode Card */}
      <Card className="border border-slate-200/90 bg-white shadow-xs rounded-xl overflow-visible w-full relative z-20">
        <CardHeader className="p-4 sm:p-5 pb-3 sm:pb-4 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold shadow-2xs shrink-0">
                <Play className="h-5 w-5 fill-current" />
              </div>
              <div>
                <CardTitle className="text-base sm:text-lg md:text-xl font-bold text-slate-900">
                  Process Parameters & Entry Mode
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm text-slate-500 font-normal">
                  Configure execution date range, select Target Entry rule (Entry 2 or 4), and trigger batch calculation.
                </CardDescription>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="flex items-center gap-1.5 flex-wrap self-start sm:self-auto">
              <span className="text-xs font-semibold text-slate-500 mr-1 hidden sm:inline">Presets:</span>
              <button
                type="button"
                onClick={handlePresetToday}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 transition-colors cursor-pointer border border-transparent hover:border-blue-200"
              >
                Today
              </button>
              <button
                type="button"
                onClick={handlePresetYesterday}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 transition-colors cursor-pointer border border-transparent hover:border-blue-200"
              >
                Yesterday
              </button>
              <button
                type="button"
                onClick={handlePresetLast7Days}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 transition-colors cursor-pointer border border-transparent hover:border-blue-200"
              >
                Last 7 Days
              </button>
              <button
                type="button"
                onClick={handlePresetThisMonth}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 transition-colors cursor-pointer border border-transparent hover:border-blue-200"
              >
                This Month
              </button>
              <button
                type="button"
                onClick={handlePresetPrevMonth}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 transition-colors cursor-pointer border border-transparent hover:border-blue-200"
              >
                Prev Month
              </button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-5 space-y-5 overflow-visible">
          {/* Controls Grid: Responsive for Mobile, Tablet, and Desktop */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* Left: Date Range (5 cols on lg) */}
            <div className="lg:col-span-5 space-y-2 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 text-blue-600" />
                    <span>Processing Date Range</span>
                  </label>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                    {calculateDaysCount()} {calculateDaysCount() === 1 ? 'Day' : 'Days'}
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <div className="flex-1">
                    <DatePicker value={fromDate} onChange={setFromDate} />
                  </div>
                  <div className="hidden sm:flex items-center justify-center">
                    <ArrowRight className="h-4 w-4 text-slate-400 shrink-0" />
                  </div>
                  <div className="flex-1">
                    <DatePicker value={toDate} onChange={setToDate} />
                  </div>
                </div>
              </div>
              <p className="text-2xs text-slate-500 font-normal">
                Raw punch logs will be queried from Attlogs for checked employees within this date range.
              </p>
            </div>

            {/* Middle: Target Entry Selection (4 cols on lg) */}
            <div className="lg:col-span-4 space-y-2 flex flex-col justify-between">
              <div>
                <label className="text-xs sm:text-sm font-bold text-slate-900 block mb-1.5">
                  Target Entry Rule
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  {/* Entry 4 Card */}
                  <button
                    type="button"
                    onClick={() => setTargetEntry(4)}
                    className={`p-2.5 sm:p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between min-h-[72px] ${
                      targetEntry === 4
                        ? 'border-blue-600 bg-blue-50/70 text-blue-950 ring-2 ring-blue-500/20 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs sm:text-sm font-bold flex items-center gap-1.5">
                        <Zap className={`h-4 w-4 ${targetEntry === 4 ? 'text-blue-600' : 'text-slate-400'}`} />
                        Entry = 4
                      </span>
                      {targetEntry === 4 && <Check className="h-4 w-4 text-blue-600" />}
                    </div>
                    <span className="text-2xs text-slate-500 mt-1 font-medium">
                      4 Punches (In, Out, Break In/Out)
                    </span>
                  </button>

                  {/* Entry 2 Card */}
                  <button
                    type="button"
                    onClick={() => setTargetEntry(2)}
                    className={`p-2.5 sm:p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between min-h-[72px] ${
                      targetEntry === 2
                        ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 ring-2 ring-indigo-500/20 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs sm:text-sm font-bold flex items-center gap-1.5">
                        <ArrowLeftRight className={`h-4 w-4 ${targetEntry === 2 ? 'text-indigo-600' : 'text-slate-400'}`} />
                        Entry = 2
                      </span>
                      {targetEntry === 2 && <Check className="h-4 w-4 text-indigo-600" />}
                    </div>
                    <span className="text-2xs text-slate-500 mt-1 font-medium">
                      2 Punches (In, Out)
                    </span>
                  </button>
                </div>
              </div>
              <p className="text-2xs text-amber-800 font-medium bg-amber-50 border border-amber-200/90 rounded-lg px-2.5 py-1">
                ⭐ If employee has Master Entry = 1, they automatically run under Entry = 1 rule.
              </p>
            </div>

            {/* Right: Action Button (3 cols on lg) */}
            <div className="lg:col-span-3 flex flex-col justify-end space-y-2">
              <Button
                onClick={handleExecute}
                disabled={isExecuting || selectedCodes.size === 0}
                className={`w-full py-5 sm:py-6 text-sm sm:text-base font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-2 ${
                  targetEntry === 2
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white disabled:bg-slate-300'
                    : 'bg-blue-600 hover:bg-blue-700 text-white disabled:bg-slate-300'
                }`}
              >
                {isExecuting ? (
                  <>
                    <RefreshCw className="h-5 w-5 animate-spin" />
                    <span>Processing Batch...</span>
                  </>
                ) : (
                  <>
                    <Play className="h-5 w-5 fill-current" />
                    <span>Process {selectedCodes.size} Employee{selectedCodes.size === 1 ? '' : 's'}</span>
                  </>
                )}
              </Button>
              <div className="text-center text-2xs text-slate-500">
                {selectedCodes.size === 0 ? (
                  <span className="text-rose-600 font-medium">⚠️ Select at least 1 employee below</span>
                ) : (
                  <span>Ready to process {selectedCodes.size} employee{selectedCodes.size === 1 ? '' : 's'} as Entry {targetEntry}</span>
                )}
              </div>
            </div>
          </div>

          {/* Execution Result Banner */}
          {executionResult && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start justify-between gap-3 animate-in fade-in duration-300">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="text-sm font-bold block">
                    Processing Completed Successfully!
                  </span>
                  <p className="text-xs sm:text-sm text-emerald-800">
                    {executionResult.message}
                  </p>
                  <div className="flex items-center gap-3 text-2xs text-emerald-700 font-semibold pt-1 flex-wrap">
                    <span>Updated: {executionResult.rowsUpdated}</span>
                    <span>•</span>
                    <span>Inserted: {executionResult.rowsInserted}</span>
                    <span>•</span>
                    <span>Duration: {executionResult.durationMs}ms</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExecutionResult(null)}
                className="text-emerald-700 hover:text-emerald-900 text-xs font-semibold cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* Execution Error Banner */}
          {executionError && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <span className="text-sm font-bold block">Execution Error</span>
                  <p className="text-xs sm:text-sm text-rose-700 mt-0.5">{executionError}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExecutionError(null)}
                className="text-rose-700 hover:text-rose-900 text-xs font-semibold cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4. Employee Selection List Card */}
      <Card className="border border-slate-200/90 bg-white shadow-xs rounded-xl overflow-visible w-full">
        <CardHeader className="p-4 sm:p-5 pb-3 sm:pb-4 border-b border-slate-100">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center font-bold shadow-2xs shrink-0">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base sm:text-lg md:text-xl font-bold text-slate-900">
                    Employee Roster Selection
                  </CardTitle>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                    {filteredEmployees.length} of {employees.length}
                  </span>
                </div>
                <CardDescription className="text-xs sm:text-sm text-slate-500 font-normal">
                  Multi-select employees using the checkboxes. Use search and location filters to target specific staff.
                </CardDescription>
              </div>
            </div>

            {/* Quick Selection Status & Bulk Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-xs font-bold flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-blue-600" />
                <span>Selected: {selectedCounts.total}</span>
                {selectedCounts.entry1 > 0 && (
                  <span className="text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded text-2xs font-bold">
                    {selectedCounts.entry1} E1
                  </span>
                )}
                {selectedCounts.entry2 > 0 && (
                  <span className="text-purple-800 bg-purple-100 px-1.5 py-0.5 rounded text-2xs font-bold">
                    {selectedCounts.entry2} E2
                  </span>
                )}
                {selectedCounts.entry4 > 0 && (
                  <span className="text-blue-800 bg-blue-100 px-1.5 py-0.5 rounded text-2xs font-bold">
                    {selectedCounts.entry4} E4
                  </span>
                )}
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={areAllFilteredSelected ? handleDeselectAll : handleSelectAllFiltered}
                className="text-xs font-semibold h-8 cursor-pointer gap-1.5"
              >
                {areAllFilteredSelected ? (
                  <>
                    <Square className="h-3.5 w-3.5" />
                    <span>Deselect All</span>
                  </>
                ) : (
                  <>
                    <CheckSquare className="h-3.5 w-3.5 text-blue-600" />
                    <span>Select Filtered ({filteredEmployees.length})</span>
                  </>
                )}
              </Button>

              {selectedCodes.size > 0 && (
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline px-2 py-1 cursor-pointer"
                >
                  Clear Selection
                </button>
              )}
            </div>
          </div>

          {/* Search Bar + Location Filter + Entry Filter Pills */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-3">
            {/* Search Input (Empcode or Name) */}
            <div className="relative flex-1 max-w-lg">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by Employee Code or Name..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-slate-50/60"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Right Controls: Location Dropdown + Entry Filter */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Location Multi-Select Dropdown */}
              <div className="relative" ref={locationDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsLocationDropdownOpen(prev => !prev)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                    selectedLocations.size > 0
                      ? 'border-blue-500 bg-blue-50/80 text-blue-900 shadow-2xs'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <MapPin className={`h-4 w-4 ${selectedLocations.size > 0 ? 'text-blue-600' : 'text-slate-500'}`} />
                  <span>
                    {selectedLocations.size === 0
                      ? `All Locations (${locations.length})`
                      : `${selectedLocations.size} Location${selectedLocations.size === 1 ? '' : 's'} Selected`}
                  </span>
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isLocationDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown Popover */}
                {isLocationDropdownOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-72 sm:w-80 bg-white rounded-xl shadow-xl border border-slate-200 z-50 p-3 space-y-2.5 animate-in fade-in zoom-in-95 duration-150">
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-blue-600" />
                        <span>Filter by Location</span>
                      </span>
                      <div className="flex items-center gap-1 text-2xs font-semibold">
                        <button
                          type="button"
                          onClick={handleSelectAllLocations}
                          className="text-blue-600 hover:underline px-1 py-0.5 cursor-pointer"
                        >
                          Select All
                        </button>
                        <span>•</span>
                        <button
                          type="button"
                          onClick={handleClearLocations}
                          className="text-rose-600 hover:underline px-1 py-0.5 cursor-pointer"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    {/* Search inside locations */}
                    <div className="relative">
                      <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Filter locations..."
                        value={locationSearchQuery}
                        onChange={e => setLocationSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-2 py-1.5 text-xs rounded-md border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50"
                      />
                    </div>

                    {/* Location Checklist */}
                    <div className="max-h-60 overflow-y-auto space-y-1 pr-1 divide-y divide-slate-50">
                      {filteredLocationList.map(loc => {
                        const isChecked = selectedLocations.has(loc.location)
                        return (
                          <label
                            key={loc.location}
                            className={`flex items-center justify-between p-1.5 rounded-lg text-xs cursor-pointer select-none transition-colors ${
                              isChecked ? 'bg-blue-50/70 text-blue-950 font-semibold' : 'hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleLocation(loc.location)}
                                className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                              <span className="truncate">
                                <span className="font-mono text-slate-500 font-normal mr-1">[{loc.location}]</span>
                                {loc.locDesc}
                              </span>
                            </div>
                            <span className="text-2xs px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono shrink-0 ml-2">
                              {loc.employeeCount}
                            </span>
                          </label>
                        )
                      })}
                      {filteredLocationList.length === 0 && (
                        <p className="text-xs text-slate-400 text-center py-3">No locations found</p>
                      )}
                    </div>

                    {/* Close button */}
                    <div className="pt-2 border-t border-slate-100 flex justify-end">
                      <Button
                        size="sm"
                        onClick={() => setIsLocationDropdownOpen(false)}
                        className="h-7 text-xs px-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer"
                      >
                        Done
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Entry Filter Tabs */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200/80">
                <button
                  type="button"
                  onClick={() => setEntryFilter('all')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                    entryFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setEntryFilter('selected')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                    entryFilter === 'selected'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Selected ({selectedCodes.size})
                </button>
                <button
                  type="button"
                  onClick={() => setEntryFilter('4')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                    entryFilter === '4'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Entry 4
                </button>
                <button
                  type="button"
                  onClick={() => setEntryFilter('2')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                    entryFilter === '2'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Entry 2
                </button>
                <button
                  type="button"
                  onClick={() => setEntryFilter('1')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                    entryFilter === '1'
                      ? 'bg-amber-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Entry 1
                </button>
              </div>
            </div>
          </div>

          {/* Active Location Filter Tags */}
          {selectedLocations.size > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap pt-2">
              <span className="text-2xs font-bold text-slate-500 uppercase tracking-wider">Filtered Locations:</span>
              {Array.from(selectedLocations).map(locCode => {
                const loc = locations.find(l => l.location === locCode)
                return (
                  <span
                    key={locCode}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200 text-2xs font-semibold"
                  >
                    <span>{loc ? `${loc.locDesc} (${locCode})` : locCode}</span>
                    <button
                      type="button"
                      onClick={() => handleToggleLocation(locCode)}
                      className="hover:text-blue-950 cursor-pointer ml-0.5"
                    >
                      ✕
                    </button>
                  </span>
                )
              })}
              <button
                type="button"
                onClick={handleClearLocations}
                className="text-2xs font-bold text-rose-600 hover:underline cursor-pointer ml-1"
              >
                Clear All
              </button>
            </div>
          )}
        </CardHeader>

        <CardContent className="p-0">
          {/* Loading State */}
          {isLoadingEmployees && (
            <div className="py-16 text-center text-slate-500 space-y-2">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto text-blue-600" />
              <p className="text-sm font-semibold">Loading employee roster from database...</p>
            </div>
          )}

          {/* Error State */}
          {!isLoadingEmployees && loadError && (
            <div className="p-6 text-center text-rose-600 space-y-2">
              <AlertCircle className="h-6 w-6 mx-auto" />
              <p className="text-sm font-semibold">{loadError}</p>
              <Button size="sm" onClick={loadData} variant="outline" className="mt-2">
                Retry Loading
              </Button>
            </div>
          )}

          {/* Empty State */}
          {!isLoadingEmployees && !loadError && filteredEmployees.length === 0 && (
            <div className="py-16 text-center text-slate-500 space-y-2">
              <Users className="h-8 w-8 mx-auto text-slate-400" />
              <p className="text-sm font-semibold text-slate-700">No employees match your filter criteria.</p>
              <p className="text-xs text-slate-500">Try adjusting your search query, location filter, or entry filter.</p>
              {(searchQuery || selectedLocations.size > 0 || entryFilter !== 'all') && (
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => { setSearchQuery(''); setSelectedLocations(new Set()); setEntryFilter('all'); }}
                  className="mt-2 text-xs"
                >
                  Reset All Filters
                </Button>
              )}
            </div>
          )}

          {/* Clean, Responsive Table (NO DESIGNATION, NO DEPT, NO CATEGORY) */}
          {!isLoadingEmployees && !loadError && filteredEmployees.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50/90 border-b border-slate-200/90 text-slate-700 font-bold uppercase tracking-wider text-xs">
                    <th className="py-3.5 px-4 w-12 text-center">
                      <input
                        type="checkbox"
                        checked={areAllFilteredSelected}
                        onChange={areAllFilteredSelected ? handleDeselectAll : handleSelectAllFiltered}
                        className="h-4.5 w-4.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        title={areAllFilteredSelected ? 'Deselect all' : 'Select all filtered'}
                      />
                    </th>
                    <th className="py-3.5 px-4">Employee Code</th>
                    <th className="py-3.5 px-4">Employee Name</th>
                    <th className="py-3.5 px-4">Location</th>
                    <th className="py-3.5 px-4">Master Entry</th>
                    <th className="py-3.5 px-4">Batch Rule</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedEmployees.map(emp => {
                    const isSelected = selectedCodes.has(emp.empCode)
                    return (
                      <tr
                        key={emp.empCode}
                        onClick={() => handleToggleEmployee(emp.empCode)}
                        className={`transition-colors cursor-pointer select-none ${
                          isSelected 
                            ? 'bg-blue-50/70 hover:bg-blue-50' 
                            : 'hover:bg-slate-50/80'
                        }`}
                      >
                        <td className="py-3 px-4 text-center" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleEmployee(emp.empCode)}
                            className="h-4.5 w-4.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-900 text-sm sm:text-base whitespace-nowrap">
                          {emp.empCode}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-900 text-sm sm:text-base">
                          {emp.name}
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-700">
                          {emp.locationDesc ? (
                            <span className="inline-flex items-center gap-1.5 font-medium text-slate-800 text-sm">
                              <MapPin className="h-4 w-4 text-blue-500 shrink-0" />
                              <span>{emp.locationDesc}</span>
                              <span className="font-mono text-xs text-slate-500 font-normal">({emp.location})</span>
                            </span>
                          ) : emp.location ? (
                            <span className="font-mono text-slate-700 font-medium text-sm">[{emp.location}]</span>
                          ) : (
                            <span className="text-slate-400 italic text-sm">Unassigned</span>
                          )}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {emp.entry === 1 ? (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs sm:text-sm font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
                              <span>★ Entry 1</span>
                            </span>
                          ) : emp.entry === 2 ? (
                            <span className="inline-flex items-center px-3 py-1 rounded-lg text-xs sm:text-sm font-bold bg-indigo-100 text-indigo-900 border border-indigo-300 shadow-2xs">
                              Entry 2
                            </span>
                          ) : emp.entry === 4 ? (
                            <span className="inline-flex items-center px-3 py-1 rounded-lg text-xs sm:text-sm font-bold bg-blue-100 text-blue-900 border border-blue-300 shadow-2xs">
                              Entry 4
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-3 py-1 rounded-lg text-xs sm:text-sm font-medium bg-slate-100 text-slate-700">
                              Entry {emp.entry}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {emp.entry === 1 ? (
                            <span className="inline-flex items-center font-bold text-xs sm:text-sm text-amber-800 bg-amber-50 px-3 py-1 rounded-lg border border-amber-200 shadow-2xs">
                              Locked Entry 1 (Single)
                            </span>
                          ) : (
                            <span className={`inline-flex items-center font-bold text-xs sm:text-sm px-3 py-1 rounded-lg border shadow-2xs ${
                              targetEntry === 4
                                ? 'text-blue-800 bg-blue-50 border-blue-200'
                                : 'text-indigo-800 bg-indigo-50 border-indigo-200'
                            }`}>
                              Will process as Entry {targetEntry}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls */}
          {!isLoadingEmployees && !loadError && filteredEmployees.length > 0 && (
            <div className="p-3 sm:p-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <span>
                  Showing <span className="font-semibold text-slate-900">{Math.min(filteredEmployees.length, (page - 1) * pageSize + 1)}</span> to{' '}
                  <span className="font-semibold text-slate-900">{Math.min(filteredEmployees.length, page * pageSize)}</span> of{' '}
                  <span className="font-semibold text-slate-900">{filteredEmployees.length}</span> employees
                </span>
                <span className="hidden sm:inline text-slate-300">|</span>
                <div className="flex items-center gap-1.5">
                  <span className="hidden sm:inline">Per page:</span>
                  <select
                    value={pageSize}
                    onChange={e => {
                      setPageSize(Number(e.target.value))
                      setPage(1)
                    }}
                    className="py-1 px-2 rounded border border-slate-200 bg-white text-xs font-semibold cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                  </select>
                </div>
              </div>

              {/* Navigation buttons */}
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(1)}
                  disabled={page <= 1}
                  className="h-8 px-2 text-xs cursor-pointer disabled:opacity-40"
                >
                  First
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="h-8 w-8 p-0 cursor-pointer disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-2 font-semibold text-slate-900 text-xs">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="h-8 w-8 p-0 cursor-pointer disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(totalPages)}
                  disabled={page >= totalPages}
                  className="h-8 px-2 text-xs cursor-pointer disabled:opacity-40"
                >
                  Last
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 5. Recent Execution History Table (Matching Auto Process & Manual Swapping) */}
      <Card className="border border-slate-200/90 bg-white shadow-xs rounded-xl overflow-hidden w-full">
        <CardHeader className="p-4 sm:p-5 pb-3 sm:pb-4 border-b border-slate-100 flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center font-bold shadow-2xs shrink-0">
              <Clock className="h-4.5 w-4.5" />
            </div>
            <div>
              <CardTitle className="text-base sm:text-lg font-bold text-slate-900">
                Recent Employee Batch Executions
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 font-normal">
                Audit log of completed employee batch attendance operations.
              </CardDescription>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadHistory}
            disabled={isLoadingHistory}
            className="h-8 text-xs cursor-pointer gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoadingHistory ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200/90 text-slate-700 font-semibold uppercase tracking-wider text-2xs">
                  <th className="py-2.5 px-4">Executed At</th>
                  <th className="py-2.5 px-4">Processed Date</th>
                  <th className="py-2.5 px-4">Mode</th>
                  <th className="py-2.5 px-4">Employees</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Rows (Upd / Ins)</th>
                  <th className="py-2.5 px-4">Duration</th>
                  <th className="py-2.5 px-4">Summary & Employee Codes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.slice(0, 15).map(item => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-4 font-mono text-slate-600 text-2xs whitespace-nowrap">
                      {formatDateTime(item.executedAt)}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-700 text-xs whitespace-nowrap">
                      {item.processDate}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-2xs font-bold border ${
                        item.targetEntry === 2 
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200' 
                          : 'bg-blue-50 text-blue-700 border-blue-200'
                      }`}>
                        Entry = {item.targetEntry || (item.triggerSource?.includes('Entry 2') ? 2 : 4)}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-slate-800 text-xs whitespace-nowrap">
                      {item.employeeCount || item.empCodes?.length || 1} emps
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      {item.status === 'Success' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          <span>Success</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
                          <AlertCircle className="h-3 w-3 text-rose-600" />
                          <span>Failed</span>
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs whitespace-nowrap">
                      <span className="font-bold text-slate-900">{item.rowsUpdated.toLocaleString()}</span>
                      <span className="text-slate-400 mx-1">/</span>
                      <span className="text-slate-600">{item.rowsInserted.toLocaleString()}</span>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-600 text-xs whitespace-nowrap">
                      {item.durationMs}ms
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 text-2xs max-w-sm">
                      <div className="truncate font-medium text-slate-700" title={item.message}>
                        {item.message}
                      </div>
                      {item.empCodes && item.empCodes.length > 0 && (
                        <div className="text-2xs font-mono text-slate-500 truncate mt-0.5" title={item.empCodes.join(', ')}>
                          Codes: {item.empCodes.slice(0, 8).join(', ')}{item.empCodes.length > 8 ? ` (+${item.empCodes.length - 8} more)` : ''}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400 text-xs">
                      No employee batch executions recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
