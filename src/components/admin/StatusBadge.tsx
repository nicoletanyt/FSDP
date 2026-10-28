import type { ReactNode } from 'react'
import { cn } from 'cn'
import { Badge } from '@/components/ui/badge'
import type {
  ApplicationStatus,
  AttendanceStatus,
  EligibilityStatus,
  FollowUpStatus,
  MembershipStatus,
  RiskLevel,
} from '@/lib/admin/types'

export type BadgeTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info'

const toneClasses: Record<BadgeTone, string> = {
  success: 'border-success/25 bg-success/10 text-success',
  warning: 'border-warning/30 bg-warning/15 text-warning-foreground dark:text-warning',
  danger: 'border-destructive/25 bg-destructive/10 text-destructive',
  neutral: 'border-border bg-muted text-muted-foreground',
  info: 'border-primary/25 bg-primary/10 text-primary',
}

export function StatusBadge({
  tone,
  children,
  dot = true,
  className,
}: {
  tone: BadgeTone
  children: ReactNode
  dot?: boolean
  className?: string
}) {
  return (
    <Badge variant="outline" className={cn('gap-1.5', toneClasses[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </Badge>
  )
}

const riskLabels: Record<RiskLevel, { label: string; tone: BadgeTone }> = {
  healthy: { label: 'Healthy', tone: 'success' },
  watch: { label: 'Watch', tone: 'warning' },
  at_risk: { label: 'At risk', tone: 'danger' },
  critical: { label: 'Critical', tone: 'danger' },
}

export function RiskBadge({ level }: { level: RiskLevel }) {
  const config = riskLabels[level]
  return <StatusBadge tone={config.tone}>{config.label}</StatusBadge>
}

const eligibilityLabels: Record<EligibilityStatus, { label: string; tone: BadgeTone }> = {
  eligible: { label: 'Eligible', tone: 'success' },
  almost: { label: 'Almost', tone: 'warning' },
  not_eligible: { label: 'Not eligible', tone: 'neutral' },
}

export function EligibilityBadge({ status }: { status: EligibilityStatus }) {
  const config = eligibilityLabels[status]
  return <StatusBadge tone={config.tone}>{config.label}</StatusBadge>
}

const attendanceLabels: Record<AttendanceStatus, { label: string; tone: BadgeTone }> = {
  present: { label: 'Present', tone: 'success' },
  late: { label: 'Late', tone: 'warning' },
  absent: { label: 'Absent', tone: 'danger' },
  excused: { label: 'Excused', tone: 'neutral' },
}

export function AttendanceBadge({ status }: { status: AttendanceStatus }) {
  const config = attendanceLabels[status]
  return <StatusBadge tone={config.tone}>{config.label}</StatusBadge>
}

const membershipLabels: Record<MembershipStatus, { label: string; tone: BadgeTone }> = {
  active: { label: 'Active', tone: 'success' },
  expired: { label: 'Expired', tone: 'danger' },
  pending: { label: 'Pending', tone: 'warning' },
}

export function MembershipBadge({ status }: { status: MembershipStatus }) {
  const config = membershipLabels[status]
  return <StatusBadge tone={config.tone}>{config.label}</StatusBadge>
}

const applicationLabels: Record<ApplicationStatus, { label: string; tone: BadgeTone }> = {
  submitted: { label: 'Submitted', tone: 'info' },
  under_review: { label: 'Under review', tone: 'warning' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
}

export function ApplicationBadge({ status }: { status: ApplicationStatus }) {
  const config = applicationLabels[status]
  return <StatusBadge tone={config.tone}>{config.label}</StatusBadge>
}

const followUpLabels: Record<FollowUpStatus, { label: string; tone: BadgeTone }> = {
  none: { label: 'Not flagged', tone: 'neutral' },
  flagged: { label: 'Flagged', tone: 'warning' },
  contacted: { label: 'Contacted', tone: 'info' },
  resolved: { label: 'Resolved', tone: 'success' },
}

export function FollowUpBadge({ status }: { status: FollowUpStatus }) {
  const config = followUpLabels[status]
  return <StatusBadge tone={config.tone}>{config.label}</StatusBadge>
}
