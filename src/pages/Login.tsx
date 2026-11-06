import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { Link } from 'react-router'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import ThemeToggle from '@/components/theme-toggle'
import { useEmptyAuthForm } from '@/hooks/use-empty-auth-form'
import { supabase } from '@/lib/supabase'
import { Mail, Lock, ArrowRight, Eye, EyeOff } from 'lucide-react'

export default function Login({ staff = false }: { staff?: boolean }) {
  const formRef = useEmptyAuthForm()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (authError) throw authError
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to sign in. Try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col lg:flex-row bg-white dark:bg-slate-950 font-sans overflow-y-auto transition-colors">
      <div className="fixed right-4 top-4 z-20 rounded-full bg-background/80 text-foreground shadow-sm ring-1 ring-border backdrop-blur">
        <ThemeToggle />
      </div>
      <div className="hidden lg:flex lg:w-1/2 relative bg-[#2c3f67] flex-shrink-0">
        <div className="absolute top-12 left-12 text-white/10 text-7xl font-serif leading-tight flex flex-col">
          <span>合</span>
          <span>氣</span>
          <span>道</span>
        </div>

        <div className="absolute bottom-16 left-12 right-12 z-10 text-white">
          <h2 className="text-4xl font-bold mb-4 tracking-wide">Train. Learn. Grow.</h2>
          <p className="text-lg opacity-90 max-w-md leading-relaxed">
            Preserving the spirit of Aikido through disciplined practice and lifelong learning.
          </p>
          <div className="w-24 h-2 bg-[#e62128] mt-8 -skew-x-12 rounded-full" />
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-8 sm:p-12">
        <div className="w-full max-w-[400px]">
          <div className="mb-10 text-left">
            <h1 className="text-4xl font-extrabold text-[#2c3f67] dark:text-blue-400 mb-3 transition-colors">
              {staff ? 'Staff Sign In' : 'Welcome Back'}
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-lg transition-colors">
              {staff ? 'Administrator and instructor access.' : 'Sign in to your account'}
            </p>
          </div>

          <form
            ref={formRef}
            autoComplete="off"
            onReset={() => { setEmail(''); setPassword('') }}
            onSubmit={handleSubmit}
            className="space-y-6"
            aria-busy={pending}
          >
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            
            <div className="space-y-2">
              <Label htmlFor="email" className="text-gray-800 dark:text-gray-300 font-semibold text-sm transition-colors">
                Email Address
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 w-5 h-5" />
                <Input 
                  id="email" 
                  name="email" 
                  type="email" 
                  value={email} 
                  onChange={(event) => setEmail(event.target.value)} 
                  autoComplete="off" 
                  required 
                  maxLength={254} 
                  // 👇 加上了 bg-white dark:bg-slate-900
                  className="pl-10 h-12 rounded-md border-gray-300 dark:border-slate-700 focus-visible:ring-[#2c3f67] w-full text-black dark:text-white bg-white dark:bg-slate-900 transition-colors" 
                  placeholder="Enter your email address"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-gray-800 dark:text-gray-300 font-semibold text-sm transition-colors">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 w-5 h-5 z-10" />
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                  // 👇 加上了 bg-white dark:bg-slate-900
                  className="pl-10 pr-12 h-12 rounded-md border-gray-300 dark:border-slate-700 focus-visible:ring-[#2c3f67] w-full text-black dark:text-white bg-white dark:bg-slate-900 transition-colors"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 z-10 grid size-9 -translate-y-1/2 place-items-center rounded-md text-gray-400 transition-colors hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2c3f67] dark:text-gray-500 dark:hover:text-gray-300 dark:focus-visible:ring-blue-500"
                >
                  {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm pt-2">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded border-gray-300 dark:border-slate-600 text-[#2c3f67] focus:ring-[#2c3f67] dark:bg-slate-900" />
                <span className="text-gray-700 dark:text-gray-300 transition-colors">Remember me</span>
              </label>
              <Link to="/forgot-password" className="text-[#e62128] dark:text-red-400 hover:underline font-medium transition-colors">
                Forgot password?
              </Link>
            </div>

            <Button 
              type="submit" 
              className="w-full bg-[#2c3f67] dark:bg-blue-600 hover:bg-[#1f2d4a] dark:hover:bg-blue-700 text-white h-12 rounded-md text-base font-medium transition-colors mt-4 flex justify-center items-center"
              disabled={pending}
            >
              {pending ? 'Signing in…' : 'Sign In'}
              {!pending && <ArrowRight className="w-5 h-5 ml-2" />}
            </Button>
          </form>

          <div className="mt-8 flex items-center">
            <div className="flex-grow border-t border-gray-200 dark:border-slate-800"></div>
            <span className="px-4 text-xs text-gray-400 dark:text-gray-500">OR</span>
            <div className="flex-grow border-t border-gray-200 dark:border-slate-800"></div>
          </div>

          <div className="mt-6 flex flex-col items-center space-y-4 text-sm">
            {!staff && (
              <p className="text-gray-600 dark:text-gray-400 transition-colors">
                New student?{' '}
                <Link to="/signup" className="text-[#e62128] dark:text-red-400 font-bold hover:underline inline-flex items-center">
                  Register here <ArrowRight className="w-4 h-4 ml-1" />
                </Link>
              </p>
            )}
            <Link to={staff ? '/login' : '/staff/login'} className="text-gray-500 dark:text-gray-400 hover:underline transition-colors">
              {staff ? 'Back to Student sign in' : 'Administrator or instructor?'}
            </Link>
          </div>

        </div>
      </div>
    </div>
  )
}