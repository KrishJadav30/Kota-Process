import React, { useState, useRef, useEffect } from 'react'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import { formatLocalDate, parseLocalDate } from '@/lib/utils'

interface DatePickerProps {
  value: string // YYYY-MM-DD
  onChange: (value: string) => void
  disabled?: boolean
  label?: string
  placeholder?: string
  align?: 'left' | 'right'
}

export function DatePicker({
  value,
  onChange,
  disabled = false,
  label,
  placeholder = 'Pick a date',
  align = 'left'
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedDate = value ? parseLocalDate(value) : null
  const [viewYear, setViewYear] = useState<number>(() =>
    selectedDate ? selectedDate.getFullYear() : new Date().getFullYear()
  )
  const [viewMonth, setViewMonth] = useState<number>(() =>
    selectedDate ? selectedDate.getMonth() : new Date().getMonth()
  )
  const [prevValue, setPrevValue] = useState(value)

  // Adjust view when value prop changes without cascading effect renders
  if (value !== prevValue) {
    setPrevValue(value)
    if (value) {
      const d = parseLocalDate(value)
      setViewYear(d.getFullYear())
      setViewMonth(d.getMonth())
    }
  }

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
    }
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear((prev) => prev - 1)
    } else {
      setViewMonth((prev) => prev - 1)
    }
  }

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear((prev) => prev + 1)
    } else {
      setViewMonth((prev) => prev + 1)
    }
  }

  const handleSelectDay = (day: number) => {
    const d = new Date(viewYear, viewMonth, day)
    onChange(formatLocalDate(d))
    setIsOpen(false)
  }

  const handleTodayClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    const today = new Date()
    onChange(formatLocalDate(today))
    setViewYear(today.getFullYear())
    setViewMonth(today.getMonth())
    setIsOpen(false)
  }

  // Calendar calculations
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]
  const weekDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const todayStr = formatLocalDate(new Date())

  const formattedDisplay = selectedDate
    ? selectedDate.toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      })
    : placeholder

  return (
    <div className="relative w-full" ref={containerRef}>
      {label && (
        <label className="block text-xs sm:text-sm font-bold text-slate-800 mb-1.5 flex items-center gap-1.5">
          <CalendarIcon className="h-4 w-4 text-blue-600 shrink-0" />
          <span>{label}</span>
        </label>
      )}

      {/* Trigger Button (shadcn style - single clean date display) */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full h-11 px-3.5 flex items-center justify-between bg-white border-2 text-left rounded-xl shadow-2xs font-semibold text-xs sm:text-sm transition-all cursor-pointer ${
          isOpen
            ? 'border-blue-600 ring-2 ring-blue-100'
            : 'border-slate-300 hover:border-slate-400 focus:border-blue-600'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <div className="flex items-center gap-2 text-slate-800 whitespace-nowrap overflow-hidden">
          <CalendarIcon className="h-4 w-4 text-blue-600 shrink-0" />
          <span className="font-semibold text-slate-900 truncate">{formattedDisplay}</span>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${
            isOpen ? 'rotate-180 text-blue-600' : ''
          }`}
        />
      </button>

      {/* shadcn Popover Calendar Dropdown */}
      {isOpen && (
        <div
          className={`absolute ${
            align === 'right' ? 'right-0' : 'left-0'
          } top-full mt-2 z-70 w-[280px] bg-white border border-slate-200 rounded-2xl shadow-2xl p-3 animate-in fade-in zoom-in-95 duration-100 ring-1 ring-slate-900/5`}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
            <span className="text-xs sm:text-sm font-bold text-slate-900">
              {monthNames[viewMonth]} {viewYear}
            </span>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleTodayClick}
                className="px-2 py-0.5 text-2xs font-bold text-blue-600 hover:bg-blue-50 rounded cursor-pointer transition-colors"
              >
                Today
              </button>
              <button
                type="button"
                onClick={handlePrevMonth}
                className="h-7 w-7 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer transition-colors"
                title="Previous Month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className="h-7 w-7 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer transition-colors"
                title="Next Month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Weekday labels */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {weekDays.map((d) => (
              <div key={d} className="text-2xs font-bold text-slate-400 py-0.5">
                {d}
              </div>
            ))}
          </div>

          {/* Day cells matrix */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {/* Blank offset */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`blank-${i}`} className="h-7 w-7" />
            ))}

            {/* Days */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const dateStr = formatLocalDate(new Date(viewYear, viewMonth, day))
              const isSelected = dateStr === value
              const isToday = dateStr === todayStr

              let btnClass = 'text-slate-700 hover:bg-slate-100 font-medium'

              if (isSelected) {
                btnClass = 'bg-blue-600 text-white font-bold shadow-xs hover:bg-blue-700'
              } else if (isToday) {
                btnClass = 'text-blue-700 font-bold border border-blue-300 bg-blue-50/50 hover:bg-blue-100'
              }

              return (
                <button
                  key={`day-${day}`}
                  type="button"
                  onClick={() => handleSelectDay(day)}
                  className={`h-7 w-7 flex items-center justify-center rounded-lg text-xs transition-colors cursor-pointer ${btnClass}`}
                >
                  {day}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
