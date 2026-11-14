import { useState, useEffect } from 'react'
import { Link } from 'react-router'
import { buttonVariants } from '@/components/ui/button'
import { CheckCircle2, Copy, Check, Calendar, Award, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'

export default function ApplicationSuccess() {
  const [copied, setCopied] = useState(false)
  const { session, loading: authLoading } = useAuth()
  const userId = session?.user.id
  
  const [membershipId, setMembershipId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [beltRank, setBeltRank] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadedUser, setLoadedUser] = useState<string | undefined>()
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  // Always reload the authoritative record, not a stale navigation-state ID.
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setMembershipId('')
    setStartDate('')
    setBeltRank('')
    setError('')
    setCopied(false)
    async function fetchProfileData() {
      if (authLoading) return
      try {
        if (!userId) throw new Error('Please sign in to view your membership.')
        const { data, error: readError } = await supabase
          .rpc('get_my_membership_application')
          .abortSignal(controller.signal)
        if (readError) throw readError
        if (!data) throw new Error('No membership application was found for this account.')
        if (!controller.signal.aborted) {
          setMembershipId(data.membershipId)
          setStartDate(data.startDate)
          setBeltRank(data.beltRank || 'Not provided')
        }
      } catch (failure) {
        const readFailure = failure as { code?: string; message?: string }
        if (!controller.signal.aborted) setError(
          readFailure?.code === 'PGRST202'
            ? 'Please apply the membership_application_confirmation database migration to load your saved application.'
            : readFailure?.message || 'Unable to load your membership. Please try again.',
        )
      } finally {
        if (!controller.signal.aborted) {
          setLoadedUser(userId)
          setLoading(false)
        }
      }
    }
    void fetchProfileData()
    return () => controller.abort()
  }, [userId, authLoading, revision])

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(membershipId)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } else {
        const textArea = document.createElement('textarea')
        textArea.value = membershipId
        textArea.style.position = 'absolute'
        textArea.style.left = '-999999px'
        textArea.style.top = '-999999px'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        try {
          const successful = document.execCommand('copy')
          if (successful) {
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }
        } catch (err) {
          console.error(err)
        }
        textArea.remove()
      }
    } catch (err) {
      console.error(err)
    }
  }

  if (authLoading || loading || loadedUser !== userId) {
    return (
      <div className="min-h-[calc(100vh-80px)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#2c3f67]" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-xl space-y-4 px-4 py-12">
        <p role="alert" className="text-destructive">{error}</p>
        <button type="button" className={buttonVariants({ variant: 'outline' })} onClick={() => setRevision(value => value + 1)}>Try again</button>
        <Link to="/dashboard" className={buttonVariants({ variant: 'ghost' })}>Return to Dashboard</Link>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-80px)] flex flex-col items-center justify-center bg-[#f8fafc] dark:bg-slate-950 px-4 sm:px-8 py-8 sm:py-12 relative overflow-hidden transition-colors">
      
      <div className="absolute bottom-0 right-0 opacity-5 dark:opacity-[0.02] pointer-events-none select-none">
        <svg width="400" height="300" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M20 80h60M30 80V50H70V80M25 50L50 30L75 50H25Z" stroke="#2c3f67" strokeWidth="4"/>
        </svg>
      </div>

      <div className="w-full max-w-2xl flex flex-col items-center z-10">
        
        <div className="mb-4 sm:mb-6 rounded-full border-[3px] border-[#2c3f67] dark:border-blue-500 p-2 transition-colors">
          <CheckCircle2 className="w-12 h-12 sm:w-16 sm:h-16 text-[#2c3f67] dark:text-blue-500 transition-colors" strokeWidth={1.5} />
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold text-[#2c3f67] dark:text-white mb-2 sm:mb-3 transition-colors text-center">
          Application Submitted!
        </h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm sm:text-base text-center mb-6 sm:mb-8 max-w-lg transition-colors px-2">
          Thank you for joining Aikido Shinju-Kai. Your membership application has been successfully submitted and is pending review.
        </p>

        <div className="w-full bg-[#f0f4f8] dark:bg-slate-900 rounded-xl p-5 sm:p-8 mb-6 sm:mb-8 transition-colors border border-transparent dark:border-slate-800">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="w-5 h-5 text-[#2c3f67] dark:text-blue-500 transition-colors" />
            <h3 className="font-bold text-[#2c3f67] dark:text-blue-500 text-base sm:text-lg transition-colors">
              What happens next?
            </h3>
          </div>
          
          <div className="space-y-4">
            {[
              "You will receive a confirmation email with your Membership ID and payment instructions within 1-2 business days.",
              "Please check your email (and spam folder) for further instructions on payment and next steps.",
              "If you have any questions, feel free to contact us at"
            ].map((text, index) => (
              <div key={index} className="flex gap-3 items-start">
                <div className="flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-gray-300 flex items-center justify-center text-[10px] sm:text-xs font-bold mt-0.5 transition-colors">
                  {index + 1}
                </div>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 leading-relaxed transition-colors break-words flex-1">
                  {text}
                  {index === 2 && (
                    <a href="mailto:membership@aikidoshinjukai.com.sg" className="text-[#e62128] dark:text-red-400 hover:underline font-medium ml-1 break-all inline-block">
                      membership@aikidoshinjukai.com.sg
                    </a>
                  )}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center mb-8 sm:mb-10 w-full">
          <p className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 mb-3 transition-colors">
            Your Membership Profile
          </p>
          
          <div className="flex flex-col w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden transition-colors">
            
            <div className="flex items-center justify-between gap-3 p-4 sm:p-6 bg-gray-50 dark:bg-slate-800/50">
              
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider mb-1">
                  Membership ID
                </span>
                <span className="text-lg sm:text-2xl font-mono font-bold text-[#2c3f67] dark:text-blue-400 transition-colors break-all">
                  {membershipId}
                </span>
              </div>
              
              <button 
                onClick={handleCopy}
                className="p-2 sm:p-3 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 hover:bg-gray-100 dark:hover:bg-slate-600 rounded-xl transition-colors shadow-sm shrink-0"
                title="Copy to clipboard"
              >
                {copied ? (
                  <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
                ) : (
                  <Copy className="w-5 h-5 text-gray-500 dark:text-gray-300" />
                )}
              </button>
            </div>

            <div className="grid grid-cols-2 divide-x divide-gray-200 dark:divide-slate-700 border-t border-gray-200 dark:border-slate-700">
              <div className="flex flex-col items-center justify-center p-4 sm:p-5 bg-white dark:bg-slate-900">
                <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 mb-1">
                  <Calendar className="w-3.5 h-3.5" />
                  <span className="text-[10px] sm:text-xs font-medium">Start Date</span>
                </div>
                <span className="text-sm sm:text-base font-bold text-gray-800 dark:text-gray-200">{startDate}</span>
              </div>
              
              <div className="flex flex-col items-center justify-center p-4 sm:p-5 bg-white dark:bg-slate-900">
                <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 mb-1">
                  <Award className="w-3.5 h-3.5" />
                  <span className="text-[10px] sm:text-xs font-medium">Initial Rank</span>
                </div>
                <span className="text-sm sm:text-base font-bold text-gray-800 dark:text-gray-200">{beltRank}</span>
                <span className="text-xs text-muted-foreground">As declared in your application</span>
              </div>
            </div>
          </div>
        </div>

        <Link 
          to="/dashboard" 
          className={buttonVariants({ 
            className: "w-full sm:w-[320px] bg-[#2c3f67] dark:bg-blue-600 hover:bg-[#1f2d4a] dark:hover:bg-blue-700 text-white h-11 sm:h-12 text-sm sm:text-base font-medium rounded-lg flex items-center justify-center transition-colors shadow-sm" 
          })}
        >
          Return to Dashboard
        </Link>

      </div>
    </div>
  )
}
