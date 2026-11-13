import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { loadExaminers, saveGradingPanel } from '@/lib/admin/grading-panels'
import type { Examiner, PanelMember } from '@/lib/admin/grading-panels'
import { supabase } from '@/lib/supabase'

export default function GradingPanelDialog({ eventId, gradingLabel, panel, onSaved }: {
  eventId: string
  gradingLabel: string
  panel: PanelMember[]
  onSaved: () => void
}) {
  const [open, setOpen] = useState(false)
  const [examiners, setExaminers] = useState<Examiner[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [chief, setChief] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setLoadError('')
    try { setExaminers(await loadExaminers(supabase)) }
    catch (failure) { setLoadError(failure instanceof Error ? failure.message : 'Unable to load examiners. Try again.') }
    finally { setLoading(false) }
  }

  function handleOpenChange(next: boolean) {
    if (saving) return
    setOpen(next)
    if (!next) return
    setSelected(panel.map(member => member.instructorId))
    setChief(panel.find(member => member.isChief)?.instructorId ?? null)
    setError('')
    void load()
  }

  // Current members stay listed even if their examiner flag was later removed,
  // so they can be taken off the panel.
  const choices = [
    ...examiners.map(examiner => ({ ...examiner, examiner: true })),
    ...panel.filter(member => !examiners.some(examiner => examiner.id === member.instructorId))
      .map(member => ({ id: member.instructorId, name: member.name, examiner: false })),
  ]

  function toggle(id: string, checked: boolean) {
    setSelected(previous => checked ? [...previous, id] : previous.filter(value => value !== id))
    if (!checked && chief === id) setChief(null)
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      await saveGradingPanel(supabase, eventId, selected, chief)
      setOpen(false)
      onSaved()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to save the grading panel. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return <Dialog open={open} onOpenChange={handleOpenChange}>
    <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
      <Pencil className="size-4" aria-hidden="true" />
      Edit panel
    </DialogTrigger>
    <DialogContent className="sm:max-w-lg" showCloseButton={!saving}>
      <DialogHeader>
        <DialogTitle>Grading panel</DialogTitle>
        <DialogDescription>
          Choose the examiners for {gradingLabel}. Only panel members can grade it.
        </DialogDescription>
      </DialogHeader>
      {loading && <p role="status" className="text-sm text-muted-foreground">Loading examiners…</p>}
      {loadError && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
        {loadError}
        <Button type="button" variant="outline" size="xs" onClick={() => void load()}>Retry</Button>
      </div>}
      {!loading && !loadError && (choices.length === 0
        ? <p className="text-sm text-muted-foreground">No instructors are marked as examiners yet. Mark them on the Instructors page.</p>
        : <fieldset className="space-y-2" disabled={saving} aria-busy={saving}>
          <legend className="sr-only">Examiners</legend>
          {choices.map(choice => {
            const member = selected.includes(choice.id)
            return <div key={choice.id} className="flex min-h-11 items-center gap-3 rounded-md border border-foreground/10 p-2">
              <label className="flex min-w-0 flex-1 items-center gap-3">
                <input type="checkbox" className="size-4 accent-primary" checked={member}
                  onChange={event => toggle(choice.id, event.target.checked)} />
                <span className="min-w-0 flex-1 truncate">{choice.name}</span>
                {!choice.examiner && <span className="text-xs text-destructive">Not an examiner</span>}
              </label>
              <label className="flex items-center gap-1.5 text-sm text-muted-foreground has-disabled:opacity-50">
                <input type="radio" name={`chief-${eventId}`} className="accent-primary" checked={chief === choice.id}
                  disabled={!member} onChange={() => setChief(choice.id)} />
                Chief
              </label>
            </div>
          })}
          {chief && <Button type="button" variant="ghost" size="xs" onClick={() => setChief(null)}>Clear chief examiner</Button>}
        </fieldset>)}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />} disabled={saving}>Cancel</DialogClose>
        <Button type="button" disabled={saving || loading || Boolean(loadError)} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save panel'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
