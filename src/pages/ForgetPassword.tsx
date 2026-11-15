import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { Link } from 'react-router'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import { useFeedback } from '@/hooks/use-feedback'
import { Mail, ArrowLeft, ArrowRight } from 'lucide-react'

export default function ForgetPassword() {
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const { notify, feedbackDialog } = useFeedback()

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')

    try {
      const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        // TODO: 确保在 App.tsx 中配置了 /update-password 路由来接收重置邮件跳转
        redirectTo: `${window.location.origin}/update-password`,
      })
      if (authError) throw authError
      notify({ title: 'Reset link sent', description: 'Please check your inbox for a link to reset your password.' })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to send reset link.')
    } finally {
      setPending(false)
    }
  }

  return (
    // fixed inset-0 z-50 用于突破外层 Layout 的宽度限制，实现全屏无侧边栏布局
    <div className="fixed inset-0 z-50 flex flex-col bg-[#f8f9fa] font-sans overflow-y-auto">
      
      <header className="w-full flex justify-between items-center px-8 py-5 bg-white border-b border-gray-100 shrink-0">
        <Link to="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#e62128] flex items-center justify-center text-white font-bold">
            合
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#2c3f67] tracking-wide">AIKIDO SHINJU-KAI</h1>
            <p className="text-xs text-[#2c3f67] opacity-80">Centralised Student Management System</p>
          </div>
        </Link>
        <Link to="/login" className="flex items-center text-sm font-semibold text-[#2c3f67] hover:underline">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Sign In
        </Link>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row relative">
        <div className="hidden lg:flex lg:w-[35%] relative bg-[#2c3f67] overflow-hidden flex-shrink-0">
          <div className="absolute inset-0 bg-black/20 mix-blend-multiply"></div>
          
          <div className="absolute top-16 left-12 text-white/10 text-6xl font-serif leading-tight flex flex-col">
            <span>合</span>
            <span>氣</span>
            <span>道</span>
          </div>
          
          <div className="absolute bottom-16 left-12 right-12 z-10 text-white">
            <p className="text-sm font-medium tracking-widest uppercase mb-1">
              Harmony · Respect · Self-Development
            </p>
          </div>
        </div>

        <div className="w-full lg:w-[65%] flex items-center justify-center p-6 sm:p-12 relative z-10">
          <div className="w-full max-w-[500px] bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-10 sm:p-12">
            
            <div className="flex flex-col items-center text-center mb-8">
              <div className="w-16 h-16 bg-[#e62128] rounded-full flex items-center justify-center mb-6 shadow-sm">
                <Mail className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-3xl font-extrabold text-[#2c3f67] mb-3">
                Forgot Password?
              </h1>
              <p className="text-gray-500 text-sm leading-relaxed max-w-sm">
                Enter your registered email address and we'll send you a link to reset your password.
              </p>
            </div>

            {error && (
              <Alert variant="destructive" className="mb-6">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2 text-left">
                <Label htmlFor="email" className="text-gray-800 font-semibold text-sm">
                  Email Address
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <Input 
                    id="email" 
                    type="email" 
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)} 
                    required 
                    className="pl-10 h-12 rounded-md border-gray-300 focus-visible:ring-[#2c3f67]" 
                    placeholder="Enter your email address"
                  />
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full bg-[#2c3f67] hover:bg-[#1f2d4a] text-white h-12 rounded-md text-base font-medium transition-colors flex justify-center items-center"
                disabled={pending}
              >
                {pending ? 'Sending...' : 'Send Reset Link'}
                {!pending && <ArrowRight className="w-5 h-5 ml-2" />}
              </Button>
            </form>

            <div className="mt-8 flex items-center">
              <div className="flex-grow border-t border-gray-200"></div>
              <span className="px-4 text-xs text-gray-400 font-medium">OR</span>
              <div className="flex-grow border-t border-gray-200"></div>
            </div>

            <div className="mt-6 text-center">
              <Link to="/login" className="text-[#2c3f67] font-semibold text-sm hover:underline">
                Back to Sign In
              </Link>
            </div>

          </div>
        </div>
      </div>
      {feedbackDialog}
    </div>
  )
}