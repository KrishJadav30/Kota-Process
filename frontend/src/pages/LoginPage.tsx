import React, { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { api, type UserProfile } from '@/api'
import { Mail, Lock, Eye, EyeOff, AlertCircle, ArrowRight, ShieldCheck, RefreshCw } from 'lucide-react'

interface LoginPageProps {
  onLoginSuccess: (user: UserProfile) => void
}

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [email, setEmail] = useState<string>('print@electronics.com')
  const [password, setPassword] = useState<string>('')
  const [showPassword, setShowPassword] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password.trim()) {
      setErrorMessage('Please enter both your email address and password.')
      return
    }

    setIsLoading(true)
    setErrorMessage(null)

    try {
      const response = await api.login(email.trim(), password)
      onLoginSuccess(response.user)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid login credentials.'
      setErrorMessage(msg)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-100 via-blue-50/40 to-indigo-100/30 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-[460px] animate-in fade-in zoom-in-95 duration-200">
        <Card className="border border-slate-200/90 bg-white/95 backdrop-blur-sm shadow-xl rounded-2xl overflow-hidden">
          {/* Header Banner */}
          <div className="pt-8 pb-4 px-6 sm:px-8 text-center bg-gradient-to-b from-blue-50/50 to-transparent flex flex-col items-center">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center text-2xl shadow-md mb-3.5">
              🚀
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              KOTA Process
            </h1>
            <p className="text-xs font-bold text-blue-600 uppercase tracking-widest mt-0.5">
              WebmisDB Operations Hub
            </p>
            <p className="text-xs sm:text-sm text-slate-500 font-normal mt-2 max-w-xs text-center">
              Sign in with your authorized credentials to access automated tasks and swapping controls.
            </p>
          </div>

          <CardContent className="p-6 sm:p-8 pt-2">
            <form onSubmit={handleLogin} className="space-y-4">
              {/* Error Alert */}
              {errorMessage && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-2.5 text-xs sm:text-sm font-semibold animate-in fade-in">
                  <AlertCircle className="h-4.5 w-4.5 text-rose-600 shrink-0 mt-0.5" />
                  <span className="leading-snug">{errorMessage}</span>
                </div>
              )}

              {/* Email Field */}
              <div className="space-y-1.5">
                <label
                  htmlFor="login-email"
                  className="block text-xs sm:text-sm font-bold text-slate-700"
                >
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Mail className="h-4.5 w-4.5" />
                  </div>
                  <input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    autoComplete="email"
                    required
                    placeholder="name@electronics.com"
                    className="w-full h-11 pl-10 pr-3.5 bg-slate-50/80 border border-slate-300 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all"
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="space-y-1.5">
                <label
                  htmlFor="login-password"
                  className="block text-xs sm:text-sm font-bold text-slate-700"
                >
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="h-4.5 w-4.5" />
                  </div>
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    autoComplete="current-password"
                    required
                    placeholder="••••••••••••"
                    className="w-full h-11 pl-10 pr-10 bg-slate-50/80 border border-slate-300 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isLoading}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4.5 w-4.5" />
                    ) : (
                      <Eye className="h-4.5 w-4.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={isLoading || !email || !password}
                  className="w-full h-11 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin text-white" />
                      <span>Signing in...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign In</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </form>

            {/* Security Badge Footer - Perfectly Centered, Styled Pill */}
            <div className="mt-6 pt-5 border-t border-slate-100 flex flex-col items-center justify-center text-center">
              <div className="inline-flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-slate-600 shadow-2xs">
                <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                <span className="text-xs font-medium text-slate-600 text-center">
                  Session ends automatically when page or browser is closed
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
