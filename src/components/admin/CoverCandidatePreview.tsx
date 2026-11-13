import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'
import { coverInvitationsKey, loadCoverInvitations } from '@/lib/admin/cover-invitations'
import CoverInvitationDialog from './CoverInvitationDialog'

type Candidate = {
  instructor_id: string
  instructor_name: string
  distance_km: number | null
  eligibility: string
}

type NearbyInstructor = {
  instructor_id: string
  instructor_name: string
  employment_type: 'full_time' | 'part_time'
  distance_km: number
}

// The database only previews cover for an upcoming class that still needs it.
function coverErrorMessage(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  if (code === '22023') return 'Cover preview is not available for this class.'
  if (code === '42501') return 'Only administrators can check cover instructors.'
  return 'Unable to check instructors.'
}

export default function CoverCandidatePreview({ eventId, className, startsAt, endsAt }: {
  eventId: string; className: string; startsAt: string; endsAt: string
}) {
  const preview = useQuery({
    queryKey: ['admin', 'cover-candidates', eventId, 'available'],
    queryFn: async (): Promise<NearbyInstructor[]> => {
      const { data, error } = await supabase.rpc('preview_class_cover_candidates', { target_event: eventId })
      if (error) throw error
      // The RPC checks distance, conflicting classes/unavailability, and a
      // matching positive slot for part-time instructors before this label.
      const available = (data as Candidate[]).filter(candidate =>
        candidate.eligibility === 'demo_only_match' && candidate.distance_km !== null)
      if (available.length === 0) return []
      const { data: instructors, error: instructorError } = await supabase.from('instructors')
        .select('id,employment_type').in('id', available.map(candidate => candidate.instructor_id))
      if (instructorError) throw instructorError
      const employment = new Map(instructors?.map(instructor => [instructor.id, instructor.employment_type]))
      return available.flatMap(candidate => {
        const employmentType = employment.get(candidate.instructor_id)
        if ((employmentType !== 'full_time' && employmentType !== 'part_time') || candidate.distance_km === null) return []
        return [{ instructor_id: candidate.instructor_id, instructor_name: candidate.instructor_name,
          employment_type: employmentType, distance_km: candidate.distance_km }]
      })
    },
    staleTime: 30_000, retry: false,
  })
  const invitations = useQuery({
    queryKey: coverInvitationsKey(eventId), queryFn: () => loadCoverInvitations(eventId),
    staleTime: 10_000, retry: false,
  })
  const invited = new Set(invitations.data?.filter(item => item.status === 'accepted').map(item => item.instructor_id))

  return <section aria-label="Cover candidate preview" className="mt-4 flex flex-1 flex-col gap-2 border-t border-foreground/10 pt-4">
    <h5 className="font-semibold">Nearby instructor preview</h5>
    {preview.isPending && <p role="status">Checking linked instructors…</p>}
    {preview.isError && <div role="alert" className="flex flex-wrap items-center gap-2 text-destructive">
      {coverErrorMessage(preview.error)} <Button size="sm" variant="outline" onClick={() => void preview.refetch()}>Retry</Button>
    </div>}
    {preview.isSuccess && preview.data.length === 0 && <p>No available nearby instructors for this class.</p>}
    {preview.isSuccess && preview.data.length > 0 && <ul className="divide-y divide-foreground/10">
      {preview.data.map(candidate => <li key={candidate.instructor_id} className="py-2 first:pt-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold">{candidate.instructor_name}</p>
          {invited.has(candidate.instructor_id) && <Badge variant="secondary" className="ml-auto bg-success/10 text-success" title="EmailJS accepted the invitation; delivery is not confirmed.">Invited</Badge>}
        </div>
        <p className="text-muted-foreground">{candidate.employment_type === 'full_time' ? 'Full time' : 'Part time'}</p>
        <p className="text-muted-foreground">{candidate.distance_km} km to dojo</p>
      </li>)}
    </ul>}
    {preview.isSuccess && <CoverInvitationDialog eventId={eventId} className={className}
      startsAt={startsAt} endsAt={endsAt} recipients={preview.data} />}
    <footer className="mt-auto border-t border-foreground/10 pt-3 text-xs text-muted-foreground">
      © <a className="underline underline-offset-2" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>
    </footer>
  </section>
}
