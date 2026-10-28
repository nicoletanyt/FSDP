import type { LucideIcon } from 'lucide-react'
import {
  Building2,
  CalendarCheck,
  FileBarChart,
  GraduationCap,
  LayoutDashboard,
  Bell,
  UserCog,
  X,
} from 'lucide-react'
import { NavLink } from 'react-router'
import { cn } from 'cn'
import { useAuth } from '@/hooks/use-auth'
import { useAdminData } from '@/lib/admin/admin-data-context'

const groups: {
  label: string
  items: { to: string; label: string; icon: LucideIcon; end?: boolean }[]
}[] = [
  {
    label: 'Monitor',
    items: [
      { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/admin/attendance', label: 'Attendance', icon: CalendarCheck },
      { to: '/admin/centres', label: 'Centres', icon: Building2 },
    ],
  },
  {
    label: 'Grading',
    items: [
      { to: '/admin/grading', label: 'Grading', icon: GraduationCap },
      { to: '/admin/notifications', label: 'Notifications', icon: Bell },
      { to: '/admin/reports', label: 'Reports', icon: FileBarChart },
    ],
  },
  {
    label: 'Manage',
    items: [
      { to: '/admin/instructors', label: 'Instructors', icon: UserCog },
    ],
  },
]

export default function AdminSidebar({
  onNavigate,
  onClose,
}: {
  onNavigate?: () => void
  onClose?: () => void
}) {
  const { profile } = useAuth()
  const { notifications } = useAdminData()
  const unread = notifications.filter((notification) => notification.channel === 'in_app').length

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-red-ink">
            Administrator
          </p>
          <p className="mt-1 text-sm font-medium">Dojo operations</p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
          >
            <X className="size-5" />
          </button>
        )}
      </div>

      <nav aria-label="Administrator navigation" className="flex-1 space-y-6">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="px-2 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {group.label}
            </p>
            <ul className="mt-2 space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cn(
                          'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <Icon className="size-4 shrink-0" aria-hidden="true" />
                          <span className="flex-1">{item.label}</span>
                          {item.label === 'Notifications' && unread > 0 && (
                            <span className="rounded-full bg-brand-red px-1.5 py-0.5 text-[0.65rem] font-semibold text-white tabular-nums">
                              {unread}
                            </span>
                          )}
                          {isActive && (
                            <span className="h-4 w-0.5 rounded-full bg-primary" aria-hidden="true" />
                          )}
                        </>
                      )}
                    </NavLink>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="rounded-lg border border-border bg-muted/40 p-3">
        <p className="text-xs text-muted-foreground">Signed in as</p>
        <p className="mt-0.5 truncate text-sm font-medium">
          {profile ? `${profile.first_name} ${profile.last_name}` : 'Administrator'}
        </p>
        <p className="truncate text-xs text-muted-foreground">{profile?.email}</p>
      </div>
    </div>
  )
}
