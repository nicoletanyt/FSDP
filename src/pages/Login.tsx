import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { Link } from 'react-router'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useEmptyAuthForm } from '@/hooks/use-empty-auth-form'
import { supabase } from '@/lib/supabase'
import { Mail, Lock, ArrowRight } from 'lucide-react'

export default function Login({ staff = false }: { staff?: boolean }) {
  const formRef = useEmptyAuthForm()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
    <div className="fixed inset-0 z-50 flex flex-col lg:flex-row bg-white font-sans overflow-y-auto">
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
            <h1 className="text-4xl font-extrabold text-[#2c3f67] mb-3">
              {staff ? 'Staff Sign In' : 'Welcome Back'}
            </h1>
            <p className="text-gray-500 text-lg">
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
              <Label htmlFor="email" className="text-gray-800 font-semibold text-sm">
                Email or Student ID
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <Input 
                  id="email" 
                  name="email" 
                  type="email" 
                  value={email} 
                  onChange={(event) => setEmail(event.target.value)} 
                  autoComplete="off" 
                  required 
                  maxLength={254} 
                  className="pl-10 h-12 rounded-md border-gray-300 focus-visible:ring-[#2c3f67] w-full" 
                  placeholder="Enter your email or student ID"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-gray-800 font-semibold text-sm">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5 z-10" />
                <Input
                  id="password"
                  name="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                  className="pl-10 h-12 rounded-md border-gray-300 focus-visible:ring-[#2c3f67] w-full"
                  placeholder="Enter your password"
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-sm pt-2">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-[#2c3f67] focus:ring-[#2c3f67]" />
                <span className="text-gray-700">Remember me</span>
              </label>
              <Link to="/forgot-password" className="text-[#e62128] hover:underline font-medium">
                Forgot password?
              </Link>
            </div>

            <Button 
              type="submit" 
              className="w-full bg-[#2c3f67] hover:bg-[#1f2d4a] text-white h-12 rounded-md text-base font-medium transition-colors mt-4 flex justify-center items-center"
              disabled={pending}
            >
              {pending ? 'Signing in…' : 'Sign In'}
              {!pending && <ArrowRight className="w-5 h-5 ml-2" />}
            </Button>
          </form>

          <div className="mt-8 flex items-center">
            <div className="flex-grow border-t border-gray-200"></div>
            <span className="px-4 text-xs text-gray-400">OR</span>
            <div className="flex-grow border-t border-gray-200"></div>
          </div>

          <div className="mt-6 flex flex-col items-center space-y-4 text-sm">
            {!staff && (
              <p className="text-gray-600">
                New student?{' '}
                <Link to="/signup" className="text-[#e62128] font-bold hover:underline inline-flex items-center">
                  Register here <ArrowRight className="w-4 h-4 ml-1" />
                </Link>
              </p>
            )}
            <Link to={staff ? '/login' : '/staff/login'} className="hidden text-gray-400 hover:underline">
              {staff ? 'Back to Student sign in' : 'Administrator?'}
            </Link>
          </div>

        </div>
      </div>
    </div>
  )
}