import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { Link } from 'react-router'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import { Mail, Lock, User, ArrowRight } from 'lucide-react'

export default function Signup() {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
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
    <div className="fixed inset-0 z-50 flex flex-col lg:flex-row bg-white font-sans overflow-y-auto">
      <div className="hidden lg:flex lg:w-1/2 relative bg-[#2c3f67] flex-shrink-0">
        <div className="absolute top-12 left-12 text-white/10 text-7xl font-serif leading-tight flex flex-col">
          <span>合</span>
          <span>氣</span>
          <span>道</span>
        </div>

        <div className="absolute bottom-16 left-12 right-12 z-10 text-white">
          <h2 className="text-4xl font-bold mb-4 tracking-wide">Begin Your Journey.</h2>
          <p className="text-lg opacity-90 max-w-md leading-relaxed">
            Join Aikido Shinju-Kai and start your path of discipline, harmony, and personal growth.
          </p>
          <div className="w-24 h-2 bg-[#e62128] mt-8 -skew-x-12 rounded-full" />
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-8 sm:p-12">
        <div className="w-full max-w-[440px]">
          <div className="mb-8 text-left">
            <h1 className="text-3xl font-extrabold text-[#2c3f67] mb-2">
              Create a Student Account
            </h1>
            <p className="text-gray-500">
              Enter your details to get started.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" aria-busy={pending}>
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName" className="text-gray-800 font-semibold text-sm">First name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <Input 
                    id="firstName" 
                    value={firstName} 
                    onChange={(e) => setFirstName(e.target.value)} 
                    required 
                    className="pl-10 h-11 rounded-md border-gray-300 focus-visible:ring-[#2c3f67]" 
                    placeholder="John"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName" className="text-gray-800 font-semibold text-sm">Last name</Label>
                <Input 
                  id="lastName" 
                  value={lastName} 
                  onChange={(e) => setLastName(e.target.value)} 
                  required 
                  className="h-11 rounded-md border-gray-300 focus-visible:ring-[#2c3f67]" 
                  placeholder="Doe"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-gray-800 font-semibold text-sm">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <Input 
                  id="email" 
                  type="email" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  required 
                  className="pl-10 h-11 rounded-md border-gray-300 focus-visible:ring-[#2c3f67]" 
                  placeholder="john.doe@example.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-gray-800 font-semibold text-sm">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5 z-10" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pl-10 h-11 rounded-md border-gray-300 focus-visible:ring-[#2c3f67]"
                  placeholder="Create a password"
                />
              </div>
              <p className="text-xs text-gray-500">
                Use at least 8 characters, including a letter and a number.
              </p>
            </div>

            <Button 
              type="submit" 
              className="w-full bg-[#2c3f67] hover:bg-[#1f2d4a] text-white h-12 rounded-md text-base font-medium transition-colors mt-2 flex justify-center items-center"
              disabled={pending}
            >
              {pending ? 'Creating account…' : 'Create Account'}
              {!pending && <ArrowRight className="w-5 h-5 ml-2" />}
            </Button>
          </form>

          <div className="mt-8 flex items-center">
            <div className="flex-grow border-t border-gray-200"></div>
            <span className="px-4 text-xs text-gray-400">OR</span>
            <div className="flex-grow border-t border-gray-200"></div>
          </div>

          <div className="mt-6 text-center text-sm">
            <p className="text-gray-600">
              Already have an account?{' '}
              <Link to="/login" className="text-[#2c3f67] font-bold hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}