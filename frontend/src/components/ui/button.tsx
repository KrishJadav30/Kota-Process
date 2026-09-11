import * as React from 'react'
import { cn } from '@/lib/utils'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'success'
  size?: 'default' | 'sm' | 'lg' | 'icon'
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const variantStyles = {
      default: 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm active:scale-[0.98]',
      destructive: 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm active:scale-[0.98]',
      outline: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-xs active:scale-[0.98]',
      secondary: 'bg-slate-100 text-slate-800 hover:bg-slate-200 active:scale-[0.98]',
      ghost: 'hover:bg-slate-100 text-slate-600 hover:text-slate-900',
      success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm active:scale-[0.98]'
    }

    const sizeStyles = {
      default: 'h-9 px-4 py-2 text-sm',
      sm: 'h-7 rounded-md px-2.5 text-xs',
      lg: 'h-11 rounded-md px-6 text-base',
      icon: 'h-9 w-9 p-0 flex items-center justify-center'
    }

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none',
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'
