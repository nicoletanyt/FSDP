import { useId, useState } from 'react'
import { Check, Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { InstructorAvatar } from '@/components/ui/avatar'
import { useInstructorSessionSave } from '@/hooks/use-instructor-session-save'
import { reportEditable, reportSnapshot } from '@/lib/instructor/session-writes'
import { instructorName } from '@/lib/instructor/student-detail'
import type { EventRow, EventStudentRow, InstructorId, InstructorRow, ReportSnapshot } from '@/lib/instructor/types'

export default function ReportEditor({ event, record, author, instructorId, compact = false }: {
  event: EventRow; record: EventStudentRow; author: InstructorRow | null; instructorId: InstructorId | null; compact?: boolean
}) {
  const mutation = useInstructorSessionSave('report', { eventId: record.event_id, studentId: record.student_id })
  const value = mutation.data?.record ?? record
  const reportAuthor = mutation.data ? mutation.data.reportAuthor : author
  const selectedEvent = mutation.data?.session.event ?? event
  const canEdit = reportEditable(selectedEvent, value, instructorId)
  const [editor, setEditor] = useState<{ key: string; draft: string; expected: ReportSnapshot } | null>(null)
  const [notice, setNotice] = useState<{ key: string; text: string; showLatest?: boolean } | null>(null)
  const editing = editor?.key === mutation.key ? editor : null
  const message = notice?.key === mutation.key ? notice : null
  const id = useId()
  const locked = mutation.pending || Boolean(mutation.error) || !canEdit
  const dirty = editing ? (editing.draft.trim() || null) !== (editing.expected.report?.trim() || null) : false
  const report = value.report?.trim()

  function finish(data: Awaited<ReturnType<typeof mutation.retry>>) {
    if (!data || !mutation.isCurrent()) return
    setEditor(null); setNotice({ key: mutation.key, text: 'Report saved.' })
  }
  async function reload() {
    const fresh = await mutation.reload()
    if (fresh && mutation.isCurrent()) {
      setEditor(current => current?.key === mutation.key ? { ...current, expected: reportSnapshot(fresh.record) } : current)
      setNotice({ key: mutation.key, text: 'Saved record reloaded. Your draft is kept.', showLatest: true })
    }
  }

  return <div className="space-y-3" data-report-editor={`${record.event_id}:${record.student_id}`}>
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-3 lg:min-h-8">
      <h4 className="text-sm font-semibold">Instructor report</h4>
      {!editing && <Button variant="ghost" size="touch" disabled={!canEdit || mutation.pending || Boolean(mutation.error)}
        onClick={() => { setEditor({ key: mutation.key, draft: value.report ?? '', expected: reportSnapshot(value) }); setNotice(null) }}>
        {report ? <Pencil aria-hidden="true" /> : <Plus aria-hidden="true" />}{report ? 'Edit report' : 'Add report'}
      </Button>}
    </div>
    {editing ? <form className="space-y-2" onSubmit={async submit => {
      submit.preventDefault()
      if (!locked && dirty) finish(await mutation.save({ kind: 'report', report: editing.draft, expected: editing.expected }))
    }}>
      <Label htmlFor={id} className="sr-only">Instructor report</Label>
      <Textarea id={id} value={editing.draft} readOnly={locked} rows={2} autoFocus
        onChange={change => { const draft = change.target.value; setEditor(current => current?.key === mutation.key ? { ...current, draft } : current) }}
        className="detail-body min-h-24 bg-background text-sm" placeholder="What went well? What should they work on next?" />
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" size="touch" disabled={mutation.pending} onClick={async () => {
          setEditor(null); setNotice(null)
          if (mutation.error) await mutation.reload()
        }}>Cancel</Button>
        <Button type="submit" size="touch" disabled={locked || !dirty}><Check aria-hidden="true" />{mutation.pending ? 'Saving…' : 'Save'}</Button>
      </div>
    </form> : report ? <>
      {reportAuthor ? compact ? <p className="text-xs text-muted-foreground">Report by {instructorName(reportAuthor)}</p> : <InstructorAvatar profile={{ id: reportAuthor.id, name: instructorName(reportAuthor), role: 'Instructor' }} showName interactive={false} avatarClassName="size-7 lg:size-6" />
        : <p className="detail-meta text-sm text-muted-foreground">Report author not recorded</p>}
      <p className={compact ? 'whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]' : 'detail-body max-w-prose whitespace-pre-wrap text-sm wrap-break-word'}>{value.report}</p>
    </> : <p className="detail-body text-sm text-muted-foreground">No report recorded.</p>}
    {mutation.error && <div className="space-y-2">
      <p role="alert" className="detail-body text-sm text-destructive">{mutation.error}</p>
      <Button variant="outline" size="touch" disabled={mutation.pending} onClick={async () => {
        if (mutation.retryMode === 'write') finish(await mutation.retry())
        else await reload()
      }}>{mutation.pending ? 'Loading…' : mutation.retryLabel}</Button>
    </div>}
    {message && <p role="status" className="detail-meta text-sm text-muted-foreground">{message.text}</p>}
    {editing && message?.showLatest && <div className="space-y-1 rounded-lg bg-muted/50 p-3">
      <p className="detail-label text-xs text-muted-foreground">Latest saved report</p>
      <p className="detail-body whitespace-pre-wrap text-sm wrap-break-word">{value.report?.trim() || 'No report recorded.'}</p>
    </div>}
  </div>
}
