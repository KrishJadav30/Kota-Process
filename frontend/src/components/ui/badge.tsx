import * as React from 'react'
import { cn } from '@/lib/utils'

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variantStyles = {
    default: 'bg-blue-100 text-blue-950 border border-blue-400',
    secondary: 'bg-slate-100 text-slate-900 border border-slate-300',
    destructive: 'bg-rose-100 text-rose-950 border border-rose-400',
    outline: 'bg-white text-slate-900 border border-slate-400',
    success: 'bg-emerald-100 text-emerald-950 border border-emerald-400',
    warning: 'bg-amber-100 text-amber-950 border border-amber-400',
  }

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold tracking-wide shadow-2xs',
        variantStyles[variant],
        className
      )}
      {...props}
    />
  )
}
