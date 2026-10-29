import { useEffect, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Building2,
  CalendarCheck,
  FileBarChart,
  GraduationCap,
  LayoutDashboard,
  Menu,
  UserCog,
} from 'lucide-react'
import { NavLink, useLocation } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from 'cn'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

const groups: { label: string; items: NavItem[] }[] = [
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
      { to: '/admin/reports', label: 'Reports', icon: FileBarChart },
    ],
  },
]

export default function AdminMobileNav() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Open navigation"
          />
        }
      >
        <Menu />
      </DialogTrigger>

      <DialogContent className="top-0 left-0 max-h-[85dvh] max-w-none translate-x-0 translate-y-0 gap-0 overflow-y-auto rounded-none rounded-b-xl p-0 sm:max-w-none">
        <DialogHeader className="border-b border-border px-4 py-3 pr-12">
          <DialogTitle>Administrator menu</DialogTitle>
          <DialogDescription className="sr-only">
            Navigate between administrator sections.
          </DialogDescription>
        </DialogHeader>

        <nav aria-label="Administrator mobile navigation" className="space-y-5 p-4">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="px-2 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {group.label}
              </p>
              <ul className="mt-1.5 space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon

                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.end}
                        onClick={() => setOpen(false)}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                            isActive
                              ? 'bg-primary/10 text-primary'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                          )
                        }
                      >
                        <Icon className="size-4 shrink-0" aria-hidden="true" />
                        {item.label}
                      </NavLink>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}

          <div className="border-t border-border pt-4">
            <NavLink
              to="/admin/instructors"
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )
              }
            >
              <UserCog className="size-4 shrink-0" aria-hidden="true" />
              Instructors
            </NavLink>
          </div>
        </nav>
      </DialogContent>
    </Dialog>
  )
}
