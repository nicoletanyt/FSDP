import { useEffect, useState } from 'react'
import type { SubmitEvent } from 'react'
import AccountFields from './AccountFields'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { createInstructor, instructorEmailMessage } from '@/lib/instructors'
import type { InstructorAccount } from '@/lib/instructors'
import { useEmptyAuthForm } from '@/hooks/use-empty-auth-form'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import type { GradeRow } from '@/lib/instructor/types'
import { INSTRUCTOR_TITLES, allowedTitles, instructorTitleLabels, isInstructorTitle, minimumDanLabel, titleRequirement } from '@/lib/instructor/titles'
import type { InstructorTitle } from '@/lib/instructor/titles'

export default function CreateInstructorForm({ onCreated }: { onCreated?: (account: InstructorAccount) => void } = {}) {
  const formRef = useEmptyAuthForm()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [createdAccount, setCreatedAccount] = useState<InstructorAccount | null>(null)
  const [grades, setGrades] = useState<GradeRow[]>([])
  const [gradesLoading, setGradesLoading] = useState(true)
  const [gradesError, setGradesError] = useState(false)
  const [reloadGrades, setReloadGrades] = useState(0)
  const [gradeId, setGradeId] = useState('')
  const [title, setTitle] = useState<InstructorTitle>('none')
  const [isExaminer, setIsExaminer] = useState(false)
  const permittedTitles = allowedTitles(gradeId)
  const titleLocked = permittedTitles.length === 1

  useEffect(() => {
    let active = true
    setGradesLoading(true)
    setGradesError(false)
    // Instructors must hold a ranked grade; 'Unranked' is not offered.
    void supabase.from('grades').select('id, label, colour, is_ranked, sort_order')
      .eq('is_ranked', true).order('sort_order').then(({ data, error }) => {
        if (!active) return
        if (error) setGradesError(true)
        else setGrades((data ?? []) as GradeRow[])
        setGradesLoading(false)
      })
    return () => { active = false }
  }, [reloadGrades])

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const element = event.currentTarget
    const form = new FormData(element)
    setPending(true)
    setError('')
    setCreatedAccount(null)
    try {
      const account = await createInstructor({
        first_name: String(form.get('first_name')).trim(),
        last_name: String(form.get('last_name')).trim(),
        email: String(form.get('email')).trim(),
        grade_id: gradeId,
        instructor_title: title,
        is_examiner: isExaminer,
      })
      element.reset()
      setGradeId('')
      setTitle('none')
      setIsExaminer(false)
      if (onCreated) onCreated(account)
      else setCreatedAccount(account)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to create the instructor.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-4">
      {createdAccount && (
        <Alert role="status" className={createdAccount.email_status === 'accepted' ? 'border-success/30 bg-success/10' : 'border-warning/30 bg-warning/10'}>
          <AlertDescription className="space-y-3 text-foreground">
            <p>Instructor account created for {createdAccount.email}.</p>
            <p>{instructorEmailMessage(createdAccount.email_status)}</p>
            <div>
              <p className="mb-1 font-medium">Generated password</p>
              <code className="block select-all break-all rounded-md bg-background p-3 text-foreground">
                {createdAccount.password}
              </code>
            </div>
            <p>Save this password; it is only shown after creation.
              The instructor can sign in at /staff/login.</p>
          </AlertDescription>
        </Alert>
      )}
      <form ref={formRef} autoComplete="off" onSubmit={handleSubmit} className="space-y-5" aria-busy={pending}>
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <AccountFields instructor />
        <div className="space-y-2">
          <Label htmlFor="instructor-grade">Grade</Label>
          <select id="instructor-grade" name="grade_id" required value={gradeId}
            disabled={pending || gradesLoading || gradesError}
            onChange={event => {
              const next = event.target.value
              setGradeId(next)
              // A title the new grade does not allow falls back to none.
              if (!allowedTitles(next).includes(title)) setTitle('none')
            }}
            className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm focus-visible:ring-[3px] focus-visible:outline-none disabled:opacity-50">
            <option value="" disabled>Select a grade</option>
            {grades.map(grade => <option key={grade.id} value={grade.id}>{grade.label}{grade.colour ? ` · ${grade.colour}` : ''}</option>)}
          </select>
          {gradesLoading && <p role="status" className="text-sm text-muted-foreground">Loading grades…</p>}
          {gradesError && <div role="alert" className="text-sm text-destructive">Unable to load grades. <Button type="button" variant="outline" size="xs" onClick={() => setReloadGrades(value => value + 1)}>Retry</Button></div>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="instructor-title">Instructor title</Label>
          <select id="instructor-title" name="instructor_title" required value={title}
            disabled={pending || titleLocked}
            aria-describedby={titleLocked ? 'instructor-title-hint' : undefined}
            onChange={event => { if (isInstructorTitle(event.target.value)) setTitle(event.target.value) }}
            className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm focus-visible:ring-[3px] focus-visible:outline-none disabled:opacity-50">
            {INSTRUCTOR_TITLES.map(option => {
              const permitted = permittedTitles.includes(option)
              return <option key={option} value={option} disabled={!permitted}>
                {instructorTitleLabels[option]}{option !== 'none' && !permitted ? ` (${minimumDanLabel(option)}+)` : ''}
              </option>
            })}
          </select>
          {titleLocked && <p id="instructor-title-hint" className="text-sm text-muted-foreground">{gradeId ? titleRequirement('fukushidoin') : 'Select a grade first'}</p>}
        </div>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="is_examiner" className="mt-0.5 size-4 accent-primary" checked={isExaminer}
            disabled={pending} onChange={event => setIsExaminer(event.target.checked)} aria-describedby="instructor-examiner-hint" />
          <span>
            <span className="font-medium">Can examine gradings</span>
            <span id="instructor-examiner-hint" className="block text-muted-foreground">Examiners can be added to grading panels.</span>
          </span>
        </label>
        <Button type="submit" disabled={pending || gradesLoading || gradesError}>
          {pending ? 'Creating instructor…' : 'Create instructor'}
        </Button>
      </form>
    </div>
  )
}
