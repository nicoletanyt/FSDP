import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { Link } from 'react-router'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import ThemeToggle from '@/components/theme-toggle'
import logo from '@/assets/logo.png'
import { supabase } from '@/lib/supabase'
import { useFeedback } from '@/hooks/use-feedback'
import { Mail, Lock, User, ArrowRight, Eye, EyeOff, Check, Circle } from 'lucide-react'

// The same rules the submit check enforces, shown live as the student types.
const passwordRules = [
  { label: 'At least 8 characters', test: (value: string) => value.length >= 8 },
  { label: 'An uppercase letter', test: (value: string) => /[A-Z]/.test(value) },
  { label: 'A lowercase letter', test: (value: string) => /[a-z]/.test(value) },
  { label: 'A number', test: (value: string) => /\d/.test(value) },
]

export default function Signup() {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const { notify, feedbackDialog } = useFeedback()

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
      notify({ title: 'Registration successful', description: 'Please check your email to verify your account.' })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to sign up. Try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="group/auth fixed inset-0 z-50 flex flex-col lg:flex-row bg-background font-sans overflow-y-auto transition-colors">
      {/* Hidden while typing: with a phone keyboard open the fixed toggle lands on top of the
          password field, so a tap on "Show password" would switch the theme instead. */}
      <div className="fixed right-4 bottom-4 z-20 rounded-full bg-background/80 text-foreground shadow-sm ring-1 ring-border backdrop-blur group-has-[input:focus]/auth:hidden">
        <ThemeToggle large />
      </div>

      {/* 左侧装饰区 */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-brand-blue dark:bg-card flex-shrink-0 transition-colors">
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
          <div className="w-24 h-2 bg-brand-red mt-8 -skew-x-12 rounded-full" />
        </div>
      </div>

      {/* 右侧表单区 */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-8 pb-24 sm:p-12 sm:pb-24">
        <div className="w-full max-w-[440px]">
          <div className="mb-8 text-left">
            <div className="mb-6 flex items-center gap-3">
              <img src={logo} alt="" className="size-12 shrink-0 object-contain" width={48} height={48} />
              <p className="text-lg font-semibold leading-tight tracking-tight">
                <span className="text-primary">Aikido</span>{' '}
                <span className="text-brand-red-ink">Shinju-Kai</span>
              </p>
            </div>
            <h1 className="text-3xl font-extrabold text-foreground mb-2 transition-colors">
              Create a Student Account
            </h1>
            <p className="text-muted-foreground transition-colors">
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
                <Label htmlFor="firstName" className="text-foreground font-semibold text-sm transition-colors">First name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
                  <Input 
                    id="firstName" 
                    value={firstName} 
                    onChange={(e) => setFirstName(e.target.value)} 
                    required 
                    className="pl-10 h-11 rounded-md border-input bg-background focus-visible:ring-ring transition-colors" 
                    placeholder="John"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName" className="text-foreground font-semibold text-sm transition-colors">Last name</Label>
                <Input 
                  id="lastName" 
                  value={lastName} 
                  onChange={(e) => setLastName(e.target.value)} 
                  required 
                  className="h-11 rounded-md border-input bg-background focus-visible:ring-ring transition-colors" 
                  placeholder="Doe"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground font-semibold text-sm transition-colors">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
                <Input 
                  id="email" 
                  type="email" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  required 
                  className="pl-10 h-11 rounded-md border-input bg-background focus-visible:ring-ring transition-colors" 
                  placeholder="john.doe@example.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground font-semibold text-sm transition-colors">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5 z-10" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pl-10 pr-12 h-11 rounded-md border-input bg-background focus-visible:ring-ring transition-colors"
                  placeholder="Create a password"
                  aria-describedby="password-rules"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 z-10 grid size-9 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                </button>
              </div>
              <ul id="password-rules" aria-label="Password requirements" className="grid gap-1.5 pt-1 text-sm sm:grid-cols-2">
                {passwordRules.map((rule) => {
                  const met = rule.test(password)
                  return (
                    <li key={rule.label} className={met ? 'flex items-center gap-2 text-success' : 'flex items-center gap-2 text-muted-foreground'}>
                      {met
                        ? <Check className="size-4 shrink-0" strokeWidth={3} aria-hidden="true" />
                        : <Circle className="size-4 shrink-0" aria-hidden="true" />}
                      {rule.label}
                      <span className="sr-only">{met ? '(met)' : '(not met yet)'}</span>
                    </li>
                  )
                })}
              </ul>
            </div>

            <Button 
              type="submit" 
              className="h-12 w-full text-base mt-2"
              disabled={pending}
            >
              {pending ? 'Creating account…' : 'Create Account'}
              {!pending && <ArrowRight className="w-5 h-5 ml-2" />}
            </Button>
          </form>

          <div className="mt-8 flex items-center">
            <div className="flex-grow border-t border-border transition-colors"></div>
            <span className="px-4 text-xs text-muted-foreground transition-colors">OR</span>
            <div className="flex-grow border-t border-border transition-colors"></div>
          </div>

          <div className="mt-6 text-center text-sm">
            <p className="text-muted-foreground transition-colors">
              Already have an account?{' '}
              <Link to="/login" className="text-primary font-bold hover:underline transition-colors">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
      {feedbackDialog}
    </div>
  )
}