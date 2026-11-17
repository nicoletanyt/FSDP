import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { IdCard } from 'lucide-react'

import EmptyState from '@/components/shared/layout/EmptyState'
import PageHeader from '@/components/shared/layout/PageHeader'
import { StudentRouteSkeleton } from '@/components/student/StudentSkeletons'
import { buttonVariants } from '@/components/ui/button'
import { useMembershipStatus } from '@/hooks/use-membership-status'

/**
 * Shows a page only to active members. Everyone else gets a short explanation
 * and the next step, instead of an error or a purchase they cannot use.
 * An unknown status (signed out, or the check failed) shows the page as before;
 * the server still enforces membership.
 */
export default function MembershipGate({ title, feature, children }: {
  /** The page's own title, so the heading does not change under the student. */
  title: string
  /** What needs a membership, e.g. "Buying class passes". */
  feature: string
  children: ReactNode
}) {
  const { status, loading } = useMembershipStatus()

  if (loading) return <StudentRouteSkeleton label="Checking your membership…" />
  if (!status || status === 'active') return <>{children}</>

  const copy = status === 'pending'
    ? { title: 'Your membership isn’t active yet', description: `${feature} opens once your membership payment is confirmed. This usually takes a few minutes.` }
    : status === 'expired'
      ? { title: 'Your membership has expired', description: `${feature} needs an active membership. Renew it to continue.` }
      : { title: 'You need a membership first', description: `${feature} needs an active membership. Applying takes a few minutes.` }

  return (
    <section className="w-full space-y-6">
      <PageHeader title={title} />
      <EmptyState
        icon={IdCard}
        title={copy.title}
        description={copy.description}
        action={status === 'pending'
          ? <Link to="/dashboard" className={buttonVariants({ variant: 'outline' })}>Back to dashboard</Link>
          : <Link to="/apply-membership" className={buttonVariants()}>{status === 'expired' ? 'Renew membership' : 'Apply for membership'}</Link>}
      />
    </section>
  )
}
