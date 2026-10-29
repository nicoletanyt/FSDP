import type { LucideIcon } from 'lucide-react'
import {
  Bell,
  Building2,
  CalendarCheck,
  FileBarChart,
  GraduationCap,
  LayoutDashboard,
} from 'lucide-react'
import { Link, useLocation } from 'react-router'
import AdminMobileNav from '@/components/admin/AdminMobileNav'
import ThemeToggle from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu'
import { useAuth } from '@/hooks/use-auth'
import { useAdminData } from '@/lib/admin/admin-data-context'
import { initials } from '@/lib/admin/format'
import { cn } from 'cn'

interface NavItem {
  to: string
  label: string
  description: string
  icon: LucideIcon
  end?: boolean
}

const groups: { label: string; items: NavItem[] }[] = [
  {
    label: 'Monitor',
    items: [
      {
        to: '/admin',
        label: 'Overview',
        description: 'Attendance, risk, and grading at a glance',
        icon: LayoutDashboard,
        end: true,
      },
      {
        to: '/admin/attendance',
        label: 'Attendance',
        description: 'Register, sessions, records, and monitoring',
        icon: CalendarCheck,
      },
      {
        to: '/admin/centres',
        label: 'Centres',
        description: 'Students and centre directory',
        icon: Building2,
      },
    ],
  },
  {
    label: 'Grading',
    items: [
      {
        to: '/admin/grading',
        label: 'Grading',
        description: 'Eligibility, opportunities, and applications',
        icon: GraduationCap,
      },
      {
        to: '/admin/reports',
        label: 'Reports',
        description: 'Centre performance and exports',
        icon: FileBarChart,
      },
    ],
  },
]

function isActive(pathname: string, to: string, end = false): boolean {
  return end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`)
}

export default function AdminNavbar() {
  const { pathname } = useLocation()
  const { profile } = useAuth()
  const { notifications } = useAdminData()
  const unread = notifications.filter((notification) => notification.channel === 'in_app').length
  const instructorsActive = isActive(pathname, '/admin/instructors')

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto grid w-full max-w-[1400px] grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <AdminMobileNav />

          <Link
            to="/admin"
            aria-label="Administrator overview"
            className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <img
              src="/logo.png"
              alt="Aikido Shinju-Kai logo"
              width={36}
              height={36}
              className="size-9 rounded-full"
            />
            <span className="hidden text-sm font-semibold tracking-tight sm:inline">
              <span className="text-primary">Aikido</span>{' '}
              <span className="text-brand-red-ink">Shinju-Kai</span>
            </span>
          </Link>
        </div>

        <NavigationMenu
          aria-label="Administrator navigation"
          className="hidden justify-self-center lg:flex"
        >
          <NavigationMenuList className="gap-[5px]">
            {groups.map((group) => {
              const groupActive = group.items.some((item) =>
                isActive(pathname, item.to, item.end),
              )

              return (
                <NavigationMenuItem key={group.label}>
                  <NavigationMenuTrigger
                    data-active={groupActive || undefined}
                    className="data-active:bg-primary/10 data-active:text-primary data-active:hover:bg-primary/10 data-active:focus:bg-primary/10"
                  >
                    {group.label}
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <ul className="w-64 p-1">
                      {group.items.map((item) => {
                        const Icon = item.icon
                        const active = isActive(pathname, item.to, item.end)

                        return (
                          <li key={item.to}>
                            <NavigationMenuLink
                              render={<Link to={item.to} />}
                              active={active}
                              closeOnClick
                              className="gap-2.5 p-2 data-active:bg-primary/10 data-active:text-primary data-active:hover:bg-primary/10 data-active:focus:bg-primary/10"
                            >
                              <Icon
                                className="size-4 shrink-0 text-muted-foreground"
                                aria-hidden="true"
                              />
                              <span className="flex min-w-0 flex-col">
                                <span className="font-medium">{item.label}</span>
                                <span className="truncate text-xs text-muted-foreground">
                                  {item.description}
                                </span>
                              </span>
                            </NavigationMenuLink>
                          </li>
                        )
                      })}
                    </ul>
                  </NavigationMenuContent>
                </NavigationMenuItem>
              )
            })}

            <NavigationMenuItem>
              <NavigationMenuLink
                render={<Link to="/admin/instructors" />}
                active={instructorsActive}
                closeOnClick
                className={cn(
                  navigationMenuTriggerStyle(),
                  'data-active:bg-primary/10 data-active:text-primary data-active:hover:bg-primary/10 data-active:focus:bg-primary/10',
                )}
              >
                Instructors
              </NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>

        <div className="flex items-center justify-end gap-[5px]">
          <ThemeToggle />

          <Button
            variant="ghost"
            size="icon"
            aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
            title="Notifications"
            render={<Link to="/admin/notifications" />}
            className="relative"
          >
            <Bell />
            {unread > 0 && (
              <span
                className="absolute top-1 right-1 size-2 rounded-full bg-brand-red"
                aria-hidden="true"
              />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            aria-label="Open administrator profile"
            title="Administrator profile"
            render={<Link to="/admin/profile" />}
            className="rounded-full p-0"
          >
            <span className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {profile ? initials(profile.first_name, profile.last_name) : 'AD'}
            </span>
          </Button>
        </div>
      </div>
    </header>
  )
}
