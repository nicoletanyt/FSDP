import { useEffect, useRef, useState } from 'react'
import { LogOut, Settings, UserCircle } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { useAuth } from '@/hooks/use-auth'
import { initials } from '@/lib/admin/format'

export default function AdminAccountMenu() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const signOutPending = useRef(false)
  const [error, setError] = useState('')
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Administrator'
  const avatar = profile ? initials(profile.first_name, profile.last_name) : 'AD'

  useEffect(() => { setOpen(false) }, [pathname, search])

  async function handleSignOut() {
    if (signOutPending.current) return
    signOutPending.current = true
    setPending(true)
    setError('')
    try {
      await signOut()
      setOpen(false)
      navigate('/staff/login', { replace: true })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to sign out. Try again.')
    } finally {
      signOutPending.current = false
      setPending(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={(nextOpen) => {
      if (pending) return
      setOpen(nextOpen)
      if (nextOpen) setError('')
    }}>
      <PopoverTrigger
        aria-label={`Open account menu for ${name}`}
        render={<Button variant="ghost" className="size-11 shrink-0 p-0" />}
      >
        <Avatar className="size-7">
          <AvatarFallback className="text-xs font-semibold">{avatar}</AvatarFallback>
        </Avatar>
      </PopoverTrigger>
      <PopoverContent className="w-56 gap-1 p-2">
        <PopoverTitle className="sr-only">Account menu</PopoverTitle>
        <Button
          variant="ghost"
          nativeButton={false}
          render={<Link to="/admin/profile" />}
          aria-current={pathname === '/admin/profile' ? 'page' : undefined}
          className="min-h-11 w-full justify-start"
          disabled={pending}
          onClick={() => setOpen(false)}
        >
          <UserCircle aria-hidden="true" /> Profile
        </Button>
        <Button
          variant="ghost"
          nativeButton={false}
          render={<Link to="/admin/settings" />}
          aria-current={pathname.startsWith('/admin/settings') ? 'page' : undefined}
          className="min-h-11 w-full justify-start"
          disabled={pending}
          onClick={() => setOpen(false)}
        >
          <Settings aria-hidden="true" /> Settings
        </Button>
        <Button
          variant="destructive"
          className="min-h-11 w-full justify-start"
          disabled={pending}
          aria-busy={pending}
          onClick={() => void handleSignOut()}
        >
          <LogOut aria-hidden="true" /> {pending ? 'Signing out…' : 'Sign out'}
        </Button>
        {error && <p role="alert" className="px-2 py-2 text-sm text-destructive">{error}</p>}
      </PopoverContent>
    </Popover>
  )
}
