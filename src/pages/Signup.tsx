import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { Link } from 'react-router'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import ThemeToggle from '@/components/theme-toggle'
import { supabase } from '@/lib/supabase'
import { Mail, Lock, User, ArrowRight, Eye, EyeOff } from 'lucide-react'

export default function Signup() {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')

    // 1. 前端密码强度校验（拦截 Supabase 的超长默认报错）
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!passwordRegex.test(password)) {
      setError('Password must be at least 8 characters, include an uppercase letter, a lowercase letter, and a number.');
      setPending(false);
      return;
    }

    try {
      const { error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
          }
        }
      })
      if (authError) throw authError
      alert('Registration successful! Please check your email for verification.')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to sign up. Try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col lg:flex-row bg-white dark:bg-slate-950 font-sans overflow-y-auto transition-colors">
      <div className="fixed right-4 top-4 z-20 rounded-full bg-background/80 text-foreground shadow-sm ring-1 ring-border backdrop-blur">
        <ThemeToggle />
      </div>

      {/* 左侧装饰区 */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-[#2c3f67] dark:bg-slate-900 flex-shrink-0 transition-colors">
        <div className="absolute top-12 left-12 text-white/10 dark:text-white/5 text-7xl font-serif leading-tight flex flex-col">
          <span>合</span>
          <span>氣</span>
          <span>道</span>
        </div>

        <div className="absolute bottom-16 left-12 right-12 z-10 text-white">
          <h2 className="text-4xl font-bold mb-4 tracking-wide">Begin Your Journey.</h2>
          <p className="text-lg opacity-90 max-w-md leading-relaxed">
            Join Aikido Shinju-Kai and start your path of discipline, harmony, and personal growth.
          </p>
          <div className="w-24 h-2 bg-[#e62128] dark:bg-red-500 mt-8 -skew-x-12 rounded-full" />
        </div>
      </div>

      {/* 右侧表单区 */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-8 sm:p-12">
        <div className="w-full max-w-[440px]">
          <div className="mb-8 text-left">
            <h1 className="text-3xl font-extrabold text-[#2c3f67] dark:text-white mb-2 transition-colors">
              Create a Student Account
            </h1>
            <p className="text-gray-500 dark:text-gray-400 transition-colors">
              Enter your details to get started.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" aria-busy={pending}>
            
            {/* 2. 报错容器自适应：加了 break-all 强制长文本换行，h-auto 确保高度动态撑开 */}
            {error && (
              <Alert variant="destructive" className="h-auto py-3 break-all whitespace-normal transition-all">
                <AlertDescription className="leading-relaxed">{error}</AlertDescription>
              </Alert>
            )}
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName" className="text-gray-800 dark:text-gray-300 font-semibold text-sm transition-colors">First name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 w-5 h-5" />
                  <Input 
                    id="firstName" 
                    value={firstName} 
                    onChange={(e) => setFirstName(e.target.value)} 
                    required 
                    className="pl-10 h-11 rounded-md border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus-visible:ring-[#2c3f67] dark:focus-visible:ring-blue-500 transition-colors" 
                    placeholder="John"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName" className="text-gray-800 dark:text-gray-300 font-semibold text-sm transition-colors">Last name</Label>
                <Input 
                  id="lastName" 
                  value={lastName} 
                  onChange={(e) => setLastName(e.target.value)} 
                  required 
                  className="h-11 rounded-md border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus-visible:ring-[#2c3f67] dark:focus-visible:ring-blue-500 transition-colors" 
                  placeholder="Doe"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-gray-800 dark:text-gray-300 font-semibold text-sm transition-colors">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 w-5 h-5" />
                <Input 
                  id="email" 
                  type="email" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  required 
                  className="pl-10 h-11 rounded-md border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus-visible:ring-[#2c3f67] dark:focus-visible:ring-blue-500 transition-colors" 
                  placeholder="john.doe@example.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-gray-800 dark:text-gray-300 font-semibold text-sm transition-colors">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 w-5 h-5 z-10" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pl-10 pr-12 h-11 rounded-md border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus-visible:ring-[#2c3f67] dark:focus-visible:ring-blue-500 transition-colors"
                  placeholder="Create a password"
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
              <p className="text-xs text-gray-500 dark:text-gray-400 transition-colors">
                Use at least 8 characters, including an uppercase letter, a lowercase letter, and a number.
              </p>
            </div>

            <Button 
              type="submit" 
              className="w-full bg-[#2c3f67] dark:bg-blue-600 hover:bg-[#1f2d4a] dark:hover:bg-blue-700 text-white h-12 rounded-md text-base font-medium transition-colors mt-2 flex justify-center items-center"
              disabled={pending}
            >
              {pending ? 'Creating account…' : 'Create Account'}
              {!pending && <ArrowRight className="w-5 h-5 ml-2" />}
            </Button>
          </form>

          <div className="mt-8 flex items-center">
            <div className="flex-grow border-t border-gray-200 dark:border-slate-800 transition-colors"></div>
            <span className="px-4 text-xs text-gray-400 dark:text-gray-500 transition-colors">OR</span>
            <div className="flex-grow border-t border-gray-200 dark:border-slate-800 transition-colors"></div>
          </div>

          <div className="mt-6 text-center text-sm">
            <p className="text-gray-600 dark:text-gray-400 transition-colors">
              Already have an account?{' '}
              <Link to="/login" className="text-[#2c3f67] dark:text-blue-400 font-bold hover:underline transition-colors">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}