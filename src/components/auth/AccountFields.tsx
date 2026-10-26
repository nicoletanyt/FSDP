import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'

export default function AccountFields({ instructor = false }: { instructor?: boolean }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="first-name">First name</Label>
          <Input id="first-name" name="first_name" autoComplete={instructor ? 'off' : 'given-name'} required maxLength={100} pattern=".*\S.*" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="last-name">Last name</Label>
          <Input id="last-name" name="last_name" autoComplete={instructor ? 'off' : 'family-name'} required maxLength={100} pattern=".*\S.*" />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="account-email">Email</Label>
        <Input id="account-email" name="email" type="email" autoComplete="off" required maxLength={254} />
      </div>
      {!instructor && (
        <div className="space-y-2">
          <Label htmlFor="account-password">Password</Label>
          <PasswordInput id="account-password" name="password" autoComplete="off" required minLength={8} maxLength={128} pattern="(?=.*[a-zA-Z])(?=.*[0-9]).*" title="Use at least 8 characters, including a letter and a number." aria-describedby="password-hint" />
          <p id="password-hint" className="text-xs text-muted-foreground">Use at least 8 characters, including a letter and a number.</p>
        </div>
      )}
    </>
  )
}
