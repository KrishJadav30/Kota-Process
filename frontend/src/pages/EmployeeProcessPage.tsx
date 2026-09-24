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
  MapPin, X, ChevronDown, CheckCheck, Clock, User,
  ArrowUpDown, ArrowUp, ArrowDown, Copy, Star, Lock
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

  // History state & filters
  const [history, setHistory] = useState<EmployeeProcessHistoryItem[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false)
  const [historyFilter, setHistoryFilter] = useState<'all' | '4' | '2'>('all')
  const [historySearch, setHistorySearch] = useState<string>('')
  const [historySortField, setHistorySortField] = useState<'executedAt' | 'duration' | 'rowsUpdated' | 'empCount'>('executedAt')
  const [historySortDirection, setHistorySortDirection] = useState<'asc' | 'desc'>('desc')
  const [selectedHistoryModalItem, setSelectedHistoryModalItem] = useState<EmployeeProcessHistoryItem | null>(null)
  const [hasCopiedCodes, setHasCopiedCodes] = useState<boolean>(false)

  // Employee Roster sorting state
  type EmployeeSortField = 'empCode' | 'name' | 'location' | 'entry'
  const [rosterSortField, setRosterSortField] = useState<EmployeeSortField>('empCode')
  const [rosterSortDirection, setRosterSortDirection] = useState<'asc' | 'desc'>('asc')

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
    let isMounted = true
    loadData()
    loadHistory()

    const pollInterval = setInterval(async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const data = await api.getEmployeeProcessHistory()
        if (isMounted) {
          setHistory([...data])
        }
      } catch (err) {
        console.warn('Background polling history error:', err)
      }
    }, 8000)

    return () => {
      isMounted = false
      clearInterval(pollInterval)
    }
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
  }, [searchQuery, selectedLocations, entryFilter, rosterSortField, rosterSortDirection])

  const handleSortRoster = (field: EmployeeSortField) => {
    if (rosterSortField === field) {
      setRosterSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setRosterSortField(field)
      setRosterSortDirection('asc')
    }
  }

  // Sorted and filtered employees
  const sortedFilteredEmployees = useMemo(() => {
    const list = [...filteredEmployees]
    list.sort((a, b) => {
      let comparison = 0
      if (rosterSortField === 'empCode') {
        comparison = a.empCode.localeCompare(b.empCode, undefined, { numeric: true })
      } else if (rosterSortField === 'name') {
        comparison = a.name.localeCompare(b.name)
      } else if (rosterSortField === 'location') {
        const locA = a.locationDesc || a.location || ''
        const locB = b.locationDesc || b.location || ''
        comparison = locA.localeCompare(locB)
      } else if (rosterSortField === 'entry') {
        comparison = a.entry - b.entry
      }
      return rosterSortDirection === 'asc' ? comparison : -comparison
    })
    return list
  }, [filteredEmployees, rosterSortField, rosterSortDirection])

  // Paginated employees
  const totalPages = Math.max(1, Math.ceil(sortedFilteredEmployees.length / pageSize))
  const paginatedEmployees = useMemo(() => {
    const start = (page - 1) * pageSize
    return sortedFilteredEmployees.slice(start, start + pageSize)
  }, [sortedFilteredEmployees, page, pageSize])

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

  const handlePresetWeekly8Days = () => {
    const now = new Date()
    const past = new Date()
    past.setDate(past.getDate() - 7)
    setFromDate(formatLocalDate(past))
    setToDate(formatLocalDate(now))
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

  const handleSortHistory = (field: 'executedAt' | 'duration' | 'rowsUpdated' | 'empCount') => {
    if (historySortField === field) {
      setHistorySortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setHistorySortField(field)
      setHistorySortDirection('desc')
    }
  }

  const filteredAndSortedHistory = useMemo(() => {
    let result = history.filter(item => {
      const targetEntry = item.targetEntry || (item.triggerSource?.includes('Entry 2') ? 2 : 4)
      if (historyFilter === '4' && targetEntry !== 4) return false
      if (historyFilter === '2' && targetEntry !== 2) return false

      if (historySearch.trim()) {
        const q = historySearch.trim().toLowerCase()
        const matchesCode = item.empCodes?.some(c => c.toLowerCase().includes(q))
        const matchesDate = item.processDate?.toLowerCase().includes(q)
        const matchesMsg = item.message?.toLowerCase().includes(q)
        if (!matchesCode && !matchesDate && !matchesMsg) return false
      }

      return true
    })

    result.sort((a, b) => {
      let comparison = 0
      if (historySortField === 'executedAt') {
        const timeA = new Date(a.executedAt).getTime() || 0
        const timeB = new Date(b.executedAt).getTime() || 0
        comparison = timeA - timeB
      } else if (historySortField === 'duration') {
        comparison = a.durationMs - b.durationMs
      } else if (historySortField === 'rowsUpdated') {
        comparison = a.rowsUpdated - b.rowsUpdated
      } else if (historySortField === 'empCount') {
        const countA = a.employeeCount || a.empCodes?.length || 0
        const countB = b.employeeCount || b.empCodes?.length || 0
        comparison = countA - countB
      }
      return historySortDirection === 'asc' ? comparison : -comparison
    })

    return result
  }, [history, historyFilter, historySearch, historySortField, historySortDirection])

  const entry4HistoryCount = useMemo(() => {
    return history.filter(h => (h.targetEntry || (h.triggerSource?.includes('Entry 2') ? 2 : 4)) === 4).length
  }, [history])

  const entry2HistoryCount = useMemo(() => {
    return history.filter(h => (h.targetEntry || (h.triggerSource?.includes('Entry 2') ? 2 : 4)) === 2).length
  }, [history])

  const handleCopyCodes = (codes: string[]) => {
    navigator.clipboard.writeText(codes.join(', '))
    setHasCopiedCodes(true)
    setTimeout(() => setHasCopiedCodes(false), 2000)
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

  // Count breakdown for all employees by entry mode
  const entryCounts = useMemo(() => {
    let e1 = 0
    let e2 = 0
    let e4 = 0
    employees.forEach(emp => {
      if (emp.entry === 1) e1++
      else if (emp.entry === 2) e2++
      else if (emp.entry === 4) e4++
    })
    return { e1, e2, e4 }
  }, [employees])

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
                className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 text-slate-700 hover:text-blue-700 cursor-pointer transition-colors"
              >
                Today
              </button>
              <button
                type="button"
                onClick={handlePresetYesterday}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 text-slate-700 hover:text-blue-700 cursor-pointer transition-colors"
              >
                Yesterday
              </button>
              <button
                type="button"
                onClick={handlePresetLast7Days}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 text-slate-700 hover:text-blue-700 cursor-pointer transition-colors"
              >
                Last 7 Days
              </button>
              <button
                type="button"
                onClick={handlePresetWeekly8Days}
                className="px-2.5 py-1 text-xs font-bold rounded-lg border border-indigo-200 bg-indigo-50/90 hover:bg-indigo-100 text-indigo-800 cursor-pointer transition-colors"
              >
                Weekly (8 Days)
              </button>
              <button
                type="button"
                onClick={handlePresetThisMonth}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-blue-200 bg-blue-50/90 hover:bg-blue-100 text-blue-800 cursor-pointer transition-colors"
              >
                This Month
              </button>
              <button
                type="button"
                onClick={handlePresetPrevMonth}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-purple-200 bg-purple-50/90 hover:bg-purple-100 text-purple-800 cursor-pointer transition-colors"
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
        <CardHeader className="p-4 sm:p-5 pb-3.5 border-b border-slate-200 bg-slate-50/60">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold shadow-2xs shrink-0">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle className="text-base sm:text-lg md:text-xl font-bold text-slate-900">
                    Employee Roster Selection
                  </CardTitle>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-200/80 text-slate-700 border border-slate-300/80">
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
              <div className="px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-xs font-bold flex items-center gap-2 shadow-2xs">
                <UserCheck className="h-4 w-4 text-blue-600" />
                <span>Selected: {selectedCounts.total}</span>
                {selectedCounts.entry1 > 0 && (
                  <span className="text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded text-2xs font-bold border border-amber-300">
                    {selectedCounts.entry1} E1
                  </span>
                )}
                {selectedCounts.entry2 > 0 && (
                  <span className="text-indigo-900 bg-indigo-100 px-1.5 py-0.5 rounded text-2xs font-bold border border-indigo-300">
                    {selectedCounts.entry2} E2
                  </span>
                )}
                {selectedCounts.entry4 > 0 && (
                  <span className="text-blue-900 bg-blue-100 px-1.5 py-0.5 rounded text-2xs font-bold border border-blue-300">
                    {selectedCounts.entry4} E4
                  </span>
                )}
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={areAllFilteredSelected ? handleDeselectAll : handleSelectAllFiltered}
                className="text-xs font-semibold h-8 cursor-pointer gap-1.5 bg-white hover:bg-slate-100 border-slate-300 text-slate-700 shadow-2xs"
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
                  className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline px-2 py-1 cursor-pointer transition-colors"
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
                className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm rounded-lg border border-slate-300 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-2xs"
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
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs sm:text-sm font-semibold transition-all cursor-pointer shadow-2xs ${
                    selectedLocations.size > 0
                      ? 'border-blue-500 bg-blue-50/80 text-blue-900'
                      : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50'
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

              {/* Segmented Entry Filter Pills */}
              <div className="inline-flex items-center p-1 bg-slate-200/80 rounded-lg text-xs font-semibold shadow-2xs gap-1">
                <button
                  type="button"
                  onClick={() => setEntryFilter('all')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    entryFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All ({employees.length})
                </button>
                <button
                  type="button"
                  onClick={() => setEntryFilter('selected')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    entryFilter === 'selected'
                      ? 'bg-blue-600 text-white shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Selected ({selectedCodes.size})
                </button>
                <button
                  type="button"
                  onClick={() => setEntryFilter('4')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                    entryFilter === '4'
                      ? 'bg-blue-600 text-white shadow-2xs font-bold'
                      : 'text-blue-700 hover:text-blue-900'
                  }`}
                >
                  <Zap className="h-3 w-3" />
                  <span>Entry 4 ({entryCounts.e4})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEntryFilter('2')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                    entryFilter === '2'
                      ? 'bg-indigo-600 text-white shadow-2xs font-bold'
                      : 'text-indigo-800 hover:text-indigo-950'
                  }`}
                >
                  <ArrowLeftRight className="h-3 w-3" />
                  <span>Entry 2 ({entryCounts.e2})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEntryFilter('1')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                    entryFilter === '1'
                      ? 'bg-amber-600 text-white shadow-2xs font-bold'
                      : 'text-amber-800 hover:text-amber-950'
                  }`}
                >
                  <Star className="h-3 w-3" />
                  <span>Entry 1 ({entryCounts.e1})</span>
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
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200 text-2xs font-semibold shadow-2xs"
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

          {/* Clean, Responsive Table with Full Divide-X and Border Highlights */}
          {!isLoadingEmployees && !loadError && filteredEmployees.length > 0 && (
            <div className="w-full overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm table-auto">
                <thead className="border-l-4 border-l-transparent">
                  <tr className="border-b border-slate-200 bg-slate-100/90 text-slate-600 font-bold uppercase text-xs tracking-wider divide-x divide-slate-200">
                    <th className="py-3.5 px-3 sm:px-4 w-12 text-center select-none">
                      <input
                        type="checkbox"
                        checked={areAllFilteredSelected}
                        onChange={areAllFilteredSelected ? handleDeselectAll : handleSelectAllFiltered}
                        className="h-4.5 w-4.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        title={areAllFilteredSelected ? 'Deselect all' : 'Select all filtered'}
                      />
                    </th>
                    <th 
                      onClick={() => handleSortRoster('empCode')}
                      className="py-3.5 px-3 sm:px-4 whitespace-nowrap w-[150px] cursor-pointer hover:bg-slate-200/70 select-none transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Employee Code</span>
                        {rosterSortField === 'empCode' ? (
                          rosterSortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5 text-blue-600" /> : <ArrowDown className="h-3.5 w-3.5 text-blue-600" />
                        ) : (
                          <ArrowUpDown className="h-3.5 w-3.5 text-slate-400 opacity-60" />
                        )}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSortRoster('name')}
                      className="py-3.5 px-3 sm:px-4 cursor-pointer hover:bg-slate-200/70 select-none transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Employee Name</span>
                        {rosterSortField === 'name' ? (
                          rosterSortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5 text-blue-600" /> : <ArrowDown className="h-3.5 w-3.5 text-blue-600" />
                        ) : (
                          <ArrowUpDown className="h-3.5 w-3.5 text-slate-400 opacity-60" />
                        )}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSortRoster('location')}
                      className="py-3.5 px-3 sm:px-4 whitespace-nowrap cursor-pointer hover:bg-slate-200/70 select-none transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Location</span>
                        {rosterSortField === 'location' ? (
                          rosterSortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5 text-blue-600" /> : <ArrowDown className="h-3.5 w-3.5 text-blue-600" />
                        ) : (
                          <ArrowUpDown className="h-3.5 w-3.5 text-slate-400 opacity-60" />
                        )}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSortRoster('entry')}
                      className="py-3.5 px-3 sm:px-4 whitespace-nowrap w-[160px] cursor-pointer hover:bg-slate-200/70 select-none transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Master Entry</span>
                        {rosterSortField === 'entry' ? (
                          rosterSortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5 text-blue-600" /> : <ArrowDown className="h-3.5 w-3.5 text-blue-600" />
                        ) : (
                          <ArrowUpDown className="h-3.5 w-3.5 text-slate-400 opacity-60" />
                        )}
                      </div>
                    </th>
                    <th className="py-3.5 px-3 sm:px-4 whitespace-nowrap w-[240px]">
                      Batch Processing Rule
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white font-normal">
                  {paginatedEmployees.map(emp => {
                    const isSelected = selectedCodes.has(emp.empCode)
                    return (
                      <tr
                        key={emp.empCode}
                        onClick={() => handleToggleEmployee(emp.empCode)}
                        className={`divide-x divide-slate-200 transition-colors cursor-pointer select-none ${
                          isSelected 
                            ? 'border-l-4 border-l-blue-600 bg-blue-50/40 hover:bg-blue-50/60' 
                            : 'border-l-4 border-l-transparent hover:bg-slate-50/80'
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="py-3.5 px-3 sm:px-4 text-center w-12" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleEmployee(emp.empCode)}
                            className="h-4.5 w-4.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>

                        {/* Employee Code */}
                        <td className="py-3.5 px-3 sm:px-4 whitespace-nowrap w-[150px]">
                          <span className="font-mono font-bold text-slate-900 text-sm bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200/90 shadow-2xs inline-block">
                            {emp.empCode}
                          </span>
                        </td>

                        {/* Employee Name */}
                        <td className="py-3.5 px-3 sm:px-4 font-semibold text-slate-900 text-sm">
                          <span className="text-slate-900 font-semibold">{emp.name}</span>
                        </td>

                        {/* Location */}
                        <td className="py-3.5 px-3 sm:px-4 text-sm text-slate-700 whitespace-nowrap">
                          {emp.locationDesc ? (
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100/90 border border-slate-200/90 text-slate-800 text-xs font-medium shadow-2xs">
                              <MapPin className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                              <span className="font-semibold">{emp.locationDesc}</span>
                              <span className="font-mono text-2xs text-slate-500 font-normal">({emp.location})</span>
                            </div>
                          ) : emp.location ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100/90 border border-slate-200/90 font-mono text-slate-700 font-semibold text-xs shadow-2xs">
                              <MapPin className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                              <span>[{emp.location}]</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-slate-400 bg-slate-100/70 border border-slate-200/50">
                              Unassigned
                            </span>
                          )}
                        </td>

                        {/* Master Entry */}
                        <td className="py-3.5 px-3 sm:px-4 whitespace-nowrap w-[160px]">
                          {emp.entry === 1 ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-900 border border-amber-300 shadow-2xs">
                              <Star className="h-3.5 w-3.5 text-amber-600 fill-amber-500 shrink-0" />
                              <span>Entry 1</span>
                            </span>
                          ) : emp.entry === 2 ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-900 border border-indigo-300 shadow-2xs">
                              <ArrowLeftRight className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                              <span>Entry 2</span>
                            </span>
                          ) : emp.entry === 4 ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-900 border border-blue-300 shadow-2xs">
                              <Zap className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                              <span>Entry 4</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                              Entry {emp.entry}
                            </span>
                          )}
                        </td>

                        {/* Batch Processing Rule */}
                        <td className="py-3.5 px-3 sm:px-4 whitespace-nowrap w-[240px]">
                          {emp.entry === 1 ? (
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-amber-200 bg-amber-50/80 text-amber-900 text-xs font-bold shadow-2xs">
                              <Lock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                              <span>Single Punch (Locked)</span>
                            </div>
                          ) : (
                            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold shadow-2xs ${
                              targetEntry === 4
                                ? 'bg-blue-50/80 border-blue-200 text-blue-900'
                                : 'bg-indigo-50/80 border-indigo-200 text-indigo-900'
                            }`}>
                              {targetEntry === 4 ? (
                                <Zap className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                              ) : (
                                <ArrowLeftRight className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                              )}
                              <span>Process as Entry {targetEntry}</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls matching History Table Footer style */}
          {!isLoadingEmployees && !loadError && filteredEmployees.length > 0 && (
            <div className="py-3.5 px-4 sm:px-5 border-t border-slate-200 bg-slate-50/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs sm:text-sm text-slate-600 font-medium">
              <div className="flex items-center gap-3 flex-wrap">
                <span>
                  Showing <span className="font-semibold text-slate-900">{Math.min(filteredEmployees.length, (page - 1) * pageSize + 1)}</span> to{' '}
                  <span className="font-semibold text-slate-900">{Math.min(filteredEmployees.length, page * pageSize)}</span> of{' '}
                  <span className="font-semibold text-slate-900">{filteredEmployees.length}</span> employees
                </span>
                <span className="text-slate-300">|</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-normal">Per page:</span>
                  <select
                    value={pageSize}
                    onChange={e => {
                      setPageSize(Number(e.target.value))
                      setPage(1)
                    }}
                    className="py-1 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold cursor-pointer shadow-2xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                  </select>
                </div>
                <span className="text-slate-300">|</span>
                <span className="inline-flex items-center gap-1.5 text-blue-700 font-semibold">
                  <span className="h-2 w-2 rounded-full bg-blue-600"></span>
                  {selectedCodes.size} selected
                </span>
              </div>

              {/* Navigation buttons */}
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(1)}
                  disabled={page <= 1}
                  className="h-8 px-2.5 text-xs font-semibold border-slate-300 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer disabled:opacity-40 shadow-2xs"
                >
                  First
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="h-8 w-8 p-0 border-slate-300 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer disabled:opacity-40 shadow-2xs"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="px-3 py-1 rounded-md bg-white border border-slate-200 text-xs font-bold text-slate-900 shadow-2xs">
                  {page} / {totalPages}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="h-8 w-8 p-0 border-slate-300 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer disabled:opacity-40 shadow-2xs"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(totalPages)}
                  disabled={page >= totalPages}
                  className="h-8 px-2.5 text-xs font-semibold border-slate-300 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer disabled:opacity-40 shadow-2xs"
                >
                  Last
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 5. Execution History Logs Table (Matching Auto Process & Manual Swapping) */}
      <Card className="border border-slate-200/90 bg-white shadow-xs rounded-xl overflow-hidden w-full">
        <CardHeader className="p-4 sm:p-5 pb-3.5 border-b border-slate-200 bg-slate-50/60">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
            <div>
              <div className="flex items-center gap-2.5">
                <CardTitle className="text-lg sm:text-xl font-bold text-slate-900">
                  Execution History Logs
                </CardTitle>
                <Badge variant="outline" className="text-xs sm:text-sm font-semibold bg-white text-slate-600 border-slate-300">
                  Top 50 Executions
                </Badge>
              </div>
              <CardDescription className="text-slate-500 text-xs sm:text-sm font-normal mt-0.5">
                Audit trail of completed employee batch attendance operations executed on MonthTrns.
              </CardDescription>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
              {/* Filter Tabs matching AutoProcess segmented pill */}
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
                  onClick={() => setHistoryFilter('4')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                    historyFilter === '4'
                      ? 'bg-blue-600 text-white shadow-2xs font-bold'
                      : 'text-blue-700 hover:text-blue-900'
                  }`}
                >
                  <Zap className="h-3.5 w-3.5" />
                  <span>Entry 4 ({entry4HistoryCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryFilter('2')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                    historyFilter === '2'
                      ? 'bg-indigo-600 text-white shadow-2xs font-bold'
                      : 'text-indigo-800 hover:text-indigo-950'
                  }`}
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                  <span>Entry 2 ({entry2HistoryCount})</span>
                </button>
              </div>

              {/* History Search Bar */}
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter by emp code..."
                  value={historySearch}
                  onChange={e => setHistorySearch(e.target.value)}
                  className="pl-8 pr-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 w-36 sm:w-44"
                />
                {historySearch && (
                  <button
                    type="button"
                    onClick={() => setHistorySearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={loadHistory}
                disabled={isLoadingHistory}
                className="self-start sm:self-auto h-9 px-3.5 text-xs sm:text-sm font-semibold border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer flex items-center gap-1.5"
              >
                <RefreshCw className={`h-4 w-4 ${isLoadingHistory ? 'animate-spin text-blue-600' : ''}`} />
                <span>Refresh Logs</span>
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {history.length === 0 ? (
            <div className="py-12 text-center text-slate-500 space-y-2">
              <Clock className="h-8 w-8 text-slate-400 mx-auto" />
              <p className="text-sm sm:text-base font-semibold text-slate-700">No employee batch executions recorded yet</p>
              <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto">
                Select employees and a date range above, then click &quot;Process Employees&quot; to execute attendance calculation. Execution records will appear here.
              </p>
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm table-auto">
                <thead className="border-l-4 border-l-transparent">
                  <tr className="border-b border-slate-200 bg-slate-100/90 text-slate-600 font-bold uppercase text-xs tracking-wider divide-x divide-slate-200">
                    <th 
                      onClick={() => handleSortHistory('executedAt')}
                      className="py-3.5 px-3 sm:px-4 whitespace-nowrap w-[170px] cursor-pointer hover:bg-slate-200/70 select-none transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Date Processed</span>
                        {historySortField === 'executedAt' ? (
                          historySortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5 text-blue-600" /> : <ArrowDown className="h-3.5 w-3.5 text-blue-600" />
                        ) : (
                          <ArrowUpDown className="h-3.5 w-3.5 text-slate-400 opacity-60" />
                        )}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSortHistory('executedAt')}
                      className="py-3.5 px-3 sm:px-4 whitespace-nowrap w-[170px] cursor-pointer hover:bg-slate-200/70 select-none transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Run Timestamp</span>
                        {historySortField === 'executedAt' ? (
                          historySortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5 text-blue-600" /> : <ArrowDown className="h-3.5 w-3.5 text-blue-600" />
                        ) : (
                          <ArrowUpDown className="h-3.5 w-3.5 text-slate-400 opacity-60" />
                        )}
                      </div>
                    </th>
                    <th className="py-3.5 px-2.5 sm:px-3 whitespace-nowrap text-center w-[100px]">Status</th>
                    <th 
                      onClick={() => handleSortHistory('duration')}
                      className="py-3.5 px-2.5 sm:px-3 whitespace-nowrap text-right w-[95px] cursor-pointer hover:bg-slate-200/70 select-none transition-colors"
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <span>Duration</span>
                        {historySortField === 'duration' ? (
                          historySortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5 text-blue-600" /> : <ArrowDown className="h-3.5 w-3.5 text-blue-600" />
                        ) : (
                          <ArrowUpDown className="h-3.5 w-3.5 text-slate-400 opacity-60" />
                        )}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSortHistory('rowsUpdated')}
                      className="py-3.5 px-3 sm:px-4 whitespace-nowrap w-[180px] cursor-pointer hover:bg-slate-200/70 select-none transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>MonthTrns Records</span>
                        {historySortField === 'rowsUpdated' ? (
                          historySortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5 text-blue-600" /> : <ArrowDown className="h-3.5 w-3.5 text-blue-600" />
                        ) : (
                          <ArrowUpDown className="h-3.5 w-3.5 text-slate-400 opacity-60" />
                        )}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSortHistory('empCount')}
                      className="py-3.5 px-3 sm:px-4 w-[280px] cursor-pointer hover:bg-slate-200/70 select-none transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Mode & Target</span>
                        {historySortField === 'empCount' ? (
                          historySortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5 text-blue-600" /> : <ArrowDown className="h-3.5 w-3.5 text-blue-600" />
                        ) : (
                          <ArrowUpDown className="h-3.5 w-3.5 text-slate-400 opacity-60" />
                        )}
                      </div>
                    </th>
                    <th className="py-3.5 px-3 sm:px-4 w-[310px] max-w-[360px]">Details & Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white font-normal">
                  {filteredAndSortedHistory.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-500">
                        <p className="text-sm font-semibold">No records found matching current filters</p>
                        <button
                          type="button"
                          onClick={() => { setHistoryFilter('all'); setHistorySearch(''); }}
                          className="mt-2 text-xs font-bold text-blue-600 hover:underline cursor-pointer"
                        >
                          Show all records
                        </button>
                      </td>
                    </tr>
                  ) : (
                    filteredAndSortedHistory.map(item => {
                      const isSuccess = item.status === 'Success'
                      const targetEntry = item.targetEntry || (item.triggerSource?.includes('Entry 2') ? 2 : 4)
                      const isEntry2 = targetEntry === 2
                      const empCount = item.employeeCount || item.empCodes?.length || 1

                      return (
                        <tr
                          key={item.id}
                          className={`divide-x divide-slate-200 transition-colors ${
                            !isSuccess
                              ? 'border-l-4 border-l-rose-500 bg-rose-50/15 hover:bg-rose-50/40'
                              : isEntry2
                              ? 'border-l-4 border-l-indigo-600 bg-indigo-50/15 hover:bg-indigo-50/40'
                              : 'border-l-4 border-l-blue-600 bg-blue-50/15 hover:bg-blue-50/40'
                          }`}
                        >
                          {/* Date Processed */}
                          <td className="py-3.5 px-3 sm:px-4 font-semibold text-slate-900 whitespace-nowrap text-sm w-[170px]">
                            <div className="flex items-center gap-1.5">
                              <Calendar className={`h-4 w-4 ${isEntry2 ? 'text-indigo-600' : 'text-blue-600'} shrink-0`} />
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

                          {/* MonthTrns Records */}
                          <td className="py-3.5 px-3 sm:px-4 whitespace-nowrap w-[180px]">
                            <div className="inline-flex items-center gap-1.5 text-sm font-semibold">
                              <span
                                className={`px-2.5 py-0.5 rounded-md font-semibold border ${
                                  isEntry2
                                    ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                    : 'bg-blue-50 text-blue-700 border-blue-200'
                                }`}
                              >
                                {item.rowsUpdated.toLocaleString()} updated
                              </span>
                              <span className="px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                                {item.rowsInserted.toLocaleString()} inserted
                              </span>
                            </div>
                          </td>

                          {/* Mode & Target - Styled Card */}
                          <td className="py-3.5 px-3 sm:px-4 text-slate-700 text-sm w-[280px]">
                            <div className={`p-2 rounded-lg border flex flex-col gap-1 shadow-2xs ${
                              isEntry2
                                ? 'bg-indigo-50/90 border-indigo-200/90 text-indigo-950'
                                : 'bg-blue-50/90 border-blue-200/90 text-blue-950'
                            }`}>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs font-extrabold uppercase tracking-wider text-white shadow-2xs ${
                                  isEntry2 ? 'bg-indigo-600' : 'bg-blue-600'
                                }`}>
                                  {isEntry2 ? <ArrowLeftRight className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
                                  Entry = {targetEntry}
                                </span>
                                <span className={`text-2xs font-bold px-1.5 py-0.5 rounded ${
                                  isEntry2 ? 'text-indigo-800 bg-indigo-100/80' : 'text-blue-800 bg-blue-100/80'
                                }`}>
                                  {empCount} {empCount === 1 ? 'Employee' : 'Employees'}
                                </span>
                              </div>
                              <div className="text-xs font-semibold leading-snug break-words">
                                {item.triggerSource || `Employee Wise Process (Entry ${targetEntry})`}
                              </div>
                            </div>
                          </td>

                          {/* Details & Summary with Clean Employee Code Chips */}
                          <td className="py-3.5 px-3 sm:px-4 text-slate-700 text-sm w-[310px] max-w-[360px]">
                            {isSuccess ? (
                              <div className="space-y-1.5">
                                <div className="flex items-start gap-2 text-slate-700 text-sm font-normal">
                                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                                  <span className="leading-snug text-xs sm:text-sm">
                                    Completed in {item.durationMs}ms. Updated {item.rowsUpdated.toLocaleString()} rows, Inserted {item.rowsInserted.toLocaleString()} rows.
                                  </span>
                                </div>
                                {item.empCodes && item.empCodes.length > 0 && (
                                  <div className="flex items-center gap-1 flex-wrap pl-6">
                                    <span className="text-2xs font-bold text-slate-400 uppercase tracking-wider">Codes:</span>
                                    {item.empCodes.slice(0, 3).map(code => (
                                      <span
                                        key={code}
                                        className="font-mono text-2xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 font-semibold"
                                      >
                                        {code}
                                      </span>
                                    ))}
                                    {item.empCodes.length > 3 && (
                                      <button
                                        type="button"
                                        onClick={() => setSelectedHistoryModalItem(item)}
                                        className="text-2xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-1.5 py-0.5 rounded border border-blue-200 cursor-pointer transition-colors"
                                      >
                                        +{item.empCodes.length - 3} more
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-start gap-2 text-rose-700 font-medium text-sm leading-snug break-words">
                                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
                                <span className="break-words text-xs sm:text-sm">
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

              {/* Table Footer matching AutoProcess */}
              <div className="py-3.5 px-4 sm:px-5 border-t border-slate-200 bg-slate-50/80 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs sm:text-sm text-slate-600 font-medium">
                <div className="flex items-center gap-3 flex-wrap">
                  <span>
                    Showing {filteredAndSortedHistory.length} of {history.length} execution record{history.length === 1 ? '' : 's'}
                  </span>
                  <span className="text-slate-300">|</span>
                  <span className="inline-flex items-center gap-1.5 text-blue-700 font-semibold">
                    <span className="h-2 w-2 rounded-full bg-blue-600"></span>
                    {entry4HistoryCount} Entry 4
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-indigo-700 font-semibold">
                    <span className="h-2 w-2 rounded-full bg-indigo-600"></span>
                    {entry2HistoryCount} Entry 2
                  </span>
                </div>
                <span className="flex items-center gap-1.5 text-slate-700 font-semibold">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  Selective employee attendance batch processing active
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 6. Employee Batch Execution Details Modal */}
      {selectedHistoryModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center text-white ${
                  selectedHistoryModalItem.targetEntry === 2 ? 'bg-indigo-600' : 'bg-blue-600'
                }`}>
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900">
                    Execution Employee Details
                  </h3>
                  <p className="text-xs text-slate-500 font-normal">
                    {selectedHistoryModalItem.processDate} • {formatDateTime(selectedHistoryModalItem.executedAt)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedHistoryModalItem(null)}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-200 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Stats Bar */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 grid grid-cols-3 gap-2 text-center">
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                <span className="text-2xs text-slate-500 font-bold uppercase tracking-wider block">Mode</span>
                <span className="text-sm font-bold text-slate-900">Entry {selectedHistoryModalItem.targetEntry}</span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                <span className="text-2xs text-slate-500 font-bold uppercase tracking-wider block">Updated / Inserted</span>
                <span className="text-sm font-bold text-emerald-700">
                  {selectedHistoryModalItem.rowsUpdated} / {selectedHistoryModalItem.rowsInserted}
                </span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                <span className="text-2xs text-slate-500 font-bold uppercase tracking-wider block">Duration</span>
                <span className="text-sm font-bold text-slate-900">{selectedHistoryModalItem.durationMs}ms</span>
              </div>
            </div>

            {/* Modal Employee Codes Roster */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-3 flex-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Targeted Employees ({selectedHistoryModalItem.empCodes?.length || 0})
                </span>
                {selectedHistoryModalItem.empCodes && selectedHistoryModalItem.empCodes.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleCopyCodes(selectedHistoryModalItem.empCodes)}
                    className="h-7 text-xs px-2.5 flex items-center gap-1.5 border-slate-300 hover:bg-slate-100 cursor-pointer"
                  >
                    {hasCopiedCodes ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="text-emerald-700 font-bold">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 text-slate-600" />
                        <span>Copy Codes</span>
                      </>
                    )}
                  </Button>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5 max-h-60 overflow-y-auto p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                {selectedHistoryModalItem.empCodes?.map(code => (
                  <span
                    key={code}
                    className="font-mono text-xs px-2.5 py-1 rounded-md bg-white border border-slate-200 font-bold text-slate-800 shadow-2xs"
                  >
                    {code}
                  </span>
                ))}
              </div>

              {/* Summary message */}
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-900 leading-relaxed">
                <span className="font-bold block mb-0.5">Execution Log Message:</span>
                {selectedHistoryModalItem.message}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex justify-end">
              <Button
                size="sm"
                onClick={() => setSelectedHistoryModalItem(null)}
                className="h-9 px-4 text-xs font-semibold bg-slate-800 hover:bg-slate-900 text-white cursor-pointer"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
