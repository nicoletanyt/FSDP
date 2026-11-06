import type { LucideIcon } from 'lucide-react'
import {
  Bell,
  Building2,
  CalendarCheck,
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
        to: '/admin/calendar',
        label: 'Calendar',
        description: 'Sessions, records, and monitoring',
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
]

function isActive(pathname: string, to: string, end = false): boolean {
  return end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`)
}

export default function AdminNavbar() {
  const { pathname } = useLocation()
  const isCalendar = pathname === '/admin/calendar'
  const { profile } = useAuth()
  const gradingActive = isActive(pathname, '/admin/grading')
  const instructorsActive = isActive(pathname, '/admin/instructors')

  return (
    <header className="sticky top-0 z-40 shrink-0 border-b border-border bg-background/90 backdrop-blur">
      <div
        className={cn(
          'mx-auto grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 py-3 sm:gap-3 lg:grid-cols-[1fr_auto_1fr]',
          isCalendar
            ? 'w-[calc(100%-2rem)] max-w-[1600px] sm:w-[94%]'
            : 'w-full max-w-[1400px] px-4 sm:px-6',
        )}
      >
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <AdminMobileNav />

          <Link
            to="/admin"
            aria-label="Administrator overview"
            className="flex items-center rounded-lg font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <img
              src="/logo.png"
              alt="Aikido Shinju-Kai logo"
              width={40}
              height={40}
              className="size-10 shrink-0 rounded-full"
            />
            <span className="ml-2 hidden leading-tight sm:block">
              <span className="block whitespace-nowrap text-base">
                <span className="text-primary">Aikido</span>{' '}
                <span className="text-brand-red-ink">Shinju-Kai</span>
              </span>
              <span className="mt-0.5 block text-3xs leading-none font-normal tracking-normal text-muted-foreground">
                Administrator
              </span>
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
                render={<Link to="/admin/grading" />}
                active={gradingActive}
                closeOnClick
                className={cn(
                  navigationMenuTriggerStyle(),
                  'data-active:bg-primary/10 data-active:text-primary data-active:hover:bg-primary/10 data-active:focus:bg-primary/10',
                )}
              >
                Grading
              </NavigationMenuLink>
            </NavigationMenuItem>

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
            aria-label="Notifications"
            title="Notifications"
            render={<Link to="/admin/notifications" />}
          >
            <Bell />
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
