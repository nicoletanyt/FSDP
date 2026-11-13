import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Bell, CheckCircle2, GraduationCap, Users } from 'lucide-react'
import { Link } from 'react-router'
import AttendanceNoticeDialog, { noticeResultMessage } from '@/components/admin/AttendanceNoticeDialog'
import { GradeLabelBadge } from '@/components/admin/AdminGradeBadge'
import AttendanceTrend from '@/components/admin/AttendanceTrend'
import CentreCombobox from '@/components/admin/CentreCombobox'
import PageHeader from '@/components/admin/PageHeader'
import StatCard from '@/components/admin/StatCard'
import { StatusBadge } from '@/components/admin/StatusBadge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/hooks/use-auth'
import { useAdminFilters } from '@/lib/admin/admin-filters'
import { loadCalendarCentres } from '@/lib/admin/live-class-calendar'
import type { WeeklyTrendPoint } from '@/lib/admin/types'
import { supabase } from '@/lib/supabase'

interface AttentionStudent {
  id: string
  first_name: string
  last_name: string
  centre_id: string
  grade: string
  level: 'at_risk'
  missed: number
  enrolments: number
  notified: boolean
}

interface OverviewSnapshot {
  active_students: number
  total_students: number
  attention_count: number
  attention_students: AttentionStudent[]
  trend: WeeklyTrendPoint[]
  eligible_count: number
  application_count: number
  open_gradings: number
  invitation_recipients: number
}

export default function Overview() {
  const [noticeOpen, setNoticeOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const { session } = useAuth()
  const { centreId, setCentreId } = useAdminFilters()
  const centresQuery = useQuery({
    queryKey: ['admin', 'overview', 'centres', session?.user.id],
    queryFn: ({ signal }) => loadCalendarCentres(signal),
    enabled: !!session,
  })
  const activeCentres = centresQuery.data?.filter(centre => centre.status === 'active') ?? []
  const validCentre = centreId === 'all' || activeCentres.some(centre => centre.id === centreId)
  useEffect(() => {
    if (centresQuery.isSuccess && !validCentre) setCentreId('all')
  }, [centresQuery.isSuccess, validCentre, setCentreId])
  const selectedCentre = validCentre && centreId !== 'all' ? centreId : null
  const overviewQuery = useQuery({
    queryKey: ['admin', 'overview', 'snapshot-recent-enrolments', session?.user.id, selectedCentre],
    queryFn: async (): Promise<OverviewSnapshot> => {
      const { data, error } = await supabase.rpc('admin_overview_recent_enrolments', { target_centre: selectedCentre })
      if (error) throw error
      if (!data) throw new Error('No Overview data was returned.')
      return data as OverviewSnapshot
    },
    enabled: !!session && centresQuery.isSuccess && !!validCentre,
    refetchOnWindowFocus: true,
  })

  const loading = centresQuery.isPending || overviewQuery.isPending
  const error = centresQuery.error ?? overviewQuery.error
  const snapshot = validCentre && !loading && !error ? overviewQuery.data : undefined
  const centreNames = new Map(centresQuery.data?.map(centre => [centre.id, centre.name]) ?? [])
  const maxPipeline = snapshot
    ? Math.max(snapshot.eligible_count, snapshot.invitation_recipients, snapshot.application_count, 1)
    : 1

  return (
    <div className="space-y-4">
      <PageHeader
        title="Overview"
        actions={centresQuery.isSuccess
          ? <CentreCombobox centres={activeCentres} value={centreId} onChange={setCentreId} />
          : undefined}
      />

      {loading && !error && <p role="status" className="text-sm text-muted-foreground">Loading live Overview…</p>}
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription className="flex flex-wrap items-center gap-3">
            Unable to load the live Overview. No demo figures are shown.
            <Button variant="outline" size="sm" onClick={() => {
              void centresQuery.refetch()
              void overviewQuery.refetch()
            }}>Retry</Button>
          </AlertDescription>
        </Alert>
      )}
      {notice && <Alert role="status"><CheckCircle2 className="size-4 text-success" aria-hidden="true" /><AlertDescription>{notice}</AlertDescription></Alert>}

      <section aria-label="Key figures" className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        <StatCard label="Active students" value={snapshot ? String(snapshot.active_students) : '—'}
          detail={snapshot ? `of ${snapshot.total_students} students` : undefined} icon={Users}
          to={snapshot ? '/admin/students?membership=active' : undefined} />
        <StatCard label="Needs attention" value={snapshot ? String(snapshot.attention_count) : '—'}
          icon={AlertTriangle}
          tone={snapshot?.attention_count ? 'danger' : 'default'}
          to={snapshot ? '/admin/students?risk=at_risk' : undefined} />
        <StatCard label="Eligible to grade" value={snapshot ? String(snapshot.eligible_count) : '—'}
          detail={snapshot ? `${snapshot.application_count} applications received` : undefined} icon={GraduationCap}
          to={snapshot ? '/admin/students?eligibility=eligible' : undefined} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Attendance trend</CardTitle>
          <CardDescription>Completed classes over the last 12 weeks {selectedCentre ? 'at the selected centre' : 'across all centres'}.</CardDescription>
        </CardHeader>
        <CardContent>{snapshot ? <AttendanceTrend data={snapshot.trend} compact /> : <p className="text-sm text-muted-foreground">{error ? 'Unavailable' : 'Loading…'}</p>}</CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
            <CardDescription>Students who missed at least two of their last five completed class enrolments.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {snapshot?.attention_students.map(student => (
              <div key={student.id} className="flex flex-col gap-3 rounded-lg border border-border/70 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-xs font-semibold text-destructive">
                    {student.first_name.charAt(0)}{student.last_name.charAt(0)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{student.first_name} {student.last_name}</p>
                    <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground"><span className="truncate">{centreNames.get(student.centre_id) ?? 'Centre'}</span> <GradeLabelBadge label={student.grade} /></p>
                    <p className="text-xs text-muted-foreground">
                      {student.missed} missed of {student.enrolments} completed enrolments
                    </p>
                  </div>
                </div>
                {student.notified && <StatusBadge tone="success" className="shrink-0">Notified</StatusBadge>}
              </div>
            ))}
            {snapshot?.attention_count === 0 && <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No students are at risk right now.</p>}
            {snapshot && snapshot.attention_count > snapshot.attention_students.length && <p className="text-xs text-muted-foreground">Showing 5 of {snapshot.attention_count} students.</p>}
            {!snapshot && <p className="text-sm text-muted-foreground">{error ? 'Unavailable' : 'Loading…'}</p>}
            <div className="flex justify-end pt-2">
              <Button variant="outline" size="sm" onClick={() => setNoticeOpen(true)} disabled={!snapshot}>
                <Bell aria-hidden="true" />Follow Up
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Grading pipeline</CardTitle>
            <CardDescription>{snapshot ? `${snapshot.open_gradings} open official gradings (all centres)` : error ? 'Unavailable' : 'Loading…'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <PipelineRow label="Eligible now" value={snapshot?.eligible_count} max={maxPipeline} tone="bg-primary" />
            <PipelineRow label="Invitation recipients (all centres)" value={snapshot?.invitation_recipients} max={maxPipeline} tone="bg-warning" />
            <PipelineRow label="Applications" value={snapshot?.application_count} max={maxPipeline} tone="bg-success" />
            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" render={<Link to="/admin/settings/email-log" />}>Send history</Button>
              <Button variant="outline" size="sm" render={<Link to="/admin/grading/applications" />}>Applications</Button>
            </div>
          </CardContent>
        </Card>
      </div>
      {noticeOpen && <AttendanceNoticeDialog centreId={selectedCentre} studentIds={null}
        onClose={() => setNoticeOpen(false)} onSent={result => {
          setNotice(noticeResultMessage(result))
          void overviewQuery.refetch()
        }} />}
    </div>
  )
}

function PipelineRow({ label, value, max, tone }: { label: string; value?: number; max: number; tone: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{value ?? '—'}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, ((value ?? 0) / max) * 100)}%` }} />
      </div>
    </div>
  )
}
