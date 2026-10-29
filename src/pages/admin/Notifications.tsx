import { useSearchParams } from 'react-router'
import { Bell, Mail, MessageSquare } from 'lucide-react'
import NotificationComposer from '@/components/admin/NotificationComposer'
import type { ComposerAudience } from '@/components/admin/NotificationComposer'
import PageHeader from '@/components/admin/PageHeader'
import { StatusBadge } from '@/components/admin/StatusBadge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAdminData } from '@/lib/admin/admin-data-context'
import { useAdminFilters } from '@/lib/admin/admin-filters'
import { formatDate } from '@/lib/admin/format'

const audiences: ComposerAudience[] = ['eligible', 'declining', 'all', 'selected']

export default function Notifications() {
  const { notifications } = useAdminData()
  const { centreId } = useAdminFilters()
  const [searchParams] = useSearchParams()
  const audienceParam = searchParams.get('audience')
  const studentParam = searchParams.get('student')
  const initialAudience = audiences.includes(audienceParam as ComposerAudience)
    ? (audienceParam as ComposerAudience)
    : 'eligible'

  const sorted = [...notifications].sort((left, right) =>
    right.sentAt.localeCompare(left.sentAt),
  )
  const totalRecipients = sorted.reduce(
    (total, notification) => total + notification.recipientCount,
    0,
  )
  const failed = sorted.reduce(
    (total, notification) => total + notification.failedCount,
    0,
  )

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Grading"
        title="Notifications"
        description="Send targeted messages to eligible or at-risk students and review delivery history."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Summary label="Notifications sent" value={`${sorted.length}`} icon={Bell} />
        <Summary label="Recipients reached" value={`${totalRecipients}`} icon={Mail} />
        <Summary
          label="Failed deliveries"
          value={`${failed}`}
          icon={MessageSquare}
          tone={failed > 0 ? 'text-destructive' : 'text-success'}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <NotificationComposer
          initialAudience={initialAudience}
          selectedStudentId={studentParam ?? undefined}
          centreId={centreId}
        />

        <Card className="overflow-hidden py-0">
          <CardHeader className="border-b border-border py-4">
            <CardTitle>Delivery history</CardTitle>
            <CardDescription>Most recent notifications first.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableCaption className="sr-only">Notification delivery history</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Sent</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Audience</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead className="text-right">Recipients</TableHead>
                  <TableHead>Delivery</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((notification) => (
                  <TableRow key={notification.id}>
                    <TableCell className="text-muted-foreground">
                      {formatDate(notification.sentAt.slice(0, 10))}
                    </TableCell>
                    <TableCell className="font-medium">{notification.template}</TableCell>
                    <TableCell className="max-w-52 truncate text-muted-foreground">
                      {notification.audience}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        tone={notification.channel === 'email' ? 'info' : 'neutral'}
                      >
                        {notification.channel === 'email' ? 'Email' : 'In-app'}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {notification.recipientCount}
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={notification.failedCount === 0 ? 'success' : 'warning'}>
                        {notification.deliveredCount} delivered
                        {notification.failedCount > 0
                          ? ` · ${notification.failedCount} failed`
                          : ''}
                      </StatusBadge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {sorted.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                No notifications sent yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Summary({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: string
  icon: typeof Bell
  tone?: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
      <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className={`text-xl font-semibold tabular-nums ${tone ?? ''}`}>{value}</p>
      </div>
    </div>
  )
}
