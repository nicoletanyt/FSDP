import { useCallback, useEffect, useRef, useState } from 'react'
import { CalendarClock, CheckCircle2, CircleAlert, Clock3, ScanLine } from 'lucide-react'
import { pendingNfcTagKey } from '@/components/instructor/NfcTagCapture'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { scanNfcTag } from '@/lib/nfc-check-in'
import type { NfcScanResult } from '@/lib/nfc-check-in'

const formatTime = (value: string) => new Intl.DateTimeFormat('en-SG', {
  timeZone: 'Asia/Singapore', hour: 'numeric', minute: '2-digit', hour12: true,
}).format(new Date(value))

export default function NfcCheckIn() {
  const [tag, setTag] = useState(() => sessionStorage.getItem(pendingNfcTagKey))
  const [result, setResult] = useState<NfcScanResult | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [feedbackVisible, setFeedbackVisible] = useState(false)
  const attempted = useRef(false)
  const inFlight = useRef(false)

  const scan = useCallback(async (eventId?: string) => {
    if (!tag || inFlight.current) return
    inFlight.current = true
    setPending(true)
    setError('')
    try {
      const response = await scanNfcTag(tag, eventId)
      setResult(response)
      if (response.status !== 'select_class') {
        sessionStorage.removeItem(pendingNfcTagKey)
        setTag(null)
      }
      if (response.status === 'marked') setFeedbackVisible(true)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to check attendance. Try again.')
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }, [tag])

  useEffect(() => {
    if (!tag || attempted.current) return
    attempted.current = true
    if (tag === 'invalid') {
      sessionStorage.removeItem(pendingNfcTagKey)
      setTag(null)
      setResult({ status: 'invalid' })
      return
    }
    void scan()
  }, [tag, scan])

  useEffect(() => {
    if (!feedbackVisible) return
    const timeout = window.setTimeout(() => setFeedbackVisible(false), 2000)
    return () => window.clearTimeout(timeout)
  }, [feedbackVisible])

  const classTime = result?.starts_at && result?.ends_at
    ? `${formatTime(result.starts_at)}–${formatTime(result.ends_at)} · Singapore time` : null

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-6" aria-label="NFC attendance">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">NFC attendance</h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          Tap a student’s tag with this phone to check their lesson today.
        </p>
      </header>

      {error && <Alert variant="destructive" role="alert">
        <CircleAlert className="size-4" aria-hidden="true" />
        <AlertDescription className="flex flex-wrap items-center gap-3">
          {error}
          {tag && <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => void scan()}>
            Try again
          </Button>}
        </AlertDescription>
      </Alert>}

      {pending && <Card><CardContent className="flex min-h-44 items-center justify-center gap-4" role="status">
        <ScanLine className="size-7 animate-pulse text-primary motion-reduce:animate-none" aria-hidden="true" />
        <span className="font-medium">Checking today’s class…</span>
      </CardContent></Card>}

      {!pending && result?.status === 'select_class' && <Card><CardContent className="space-y-5 py-6">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Choose a class for {result.student_name}</h2>
          <p className="text-sm text-muted-foreground">More than one class is in its check-in window.</p>
        </div>
        <div className="grid gap-2">
          {result.classes?.map((item) => <Button key={item.event_id} type="button" variant="outline"
            className="h-auto min-h-12 justify-start whitespace-normal py-3 text-left"
            onClick={() => void scan(item.event_id)} disabled={pending}>
            {item.class_name} · {formatTime(item.starts_at)}–{formatTime(item.ends_at)}
          </Button>)}
        </div>
      </CardContent></Card>}

      {!pending && result?.status === 'marked' && <Card className="border-success/30 bg-success/5" role="status">
        <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 py-8 text-center">
          {feedbackVisible ? <>
            <CheckCircle2 className="size-12 text-success" aria-hidden="true" />
            <h2 className="text-2xl font-semibold text-success">Attendance Marked</h2>
            <p className="font-medium">{result.student_name}</p>
            <p className="text-sm text-muted-foreground">{result.class_name} · {classTime}</p>
            {result.already_marked && <p className="text-sm text-muted-foreground">Already recorded for this class.</p>}
          </> : <>
            <ScanLine className="size-9 text-primary" aria-hidden="true" />
            <h2 className="text-lg font-semibold">Ready for the next tag</h2>
            <p className="text-sm text-muted-foreground">Attendance has been recorded.</p>
          </>}
        </CardContent>
      </Card>}

      {!pending && result?.status === 'upcoming' && <Card role="status"><CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 py-8 text-center">
        <Clock3 className="size-10 text-primary" aria-hidden="true" />
        <h2 className="text-2xl font-semibold">Class starts at {formatTime(result.starts_at!)}</h2>
        <p className="font-medium">{result.student_name}</p>
        <p className="text-sm text-muted-foreground">{result.class_name} · Check-in opens 10 minutes before class.</p>
      </CardContent></Card>}

      {!pending && result?.status === 'absent' && <Card className="border-destructive/30 bg-destructive/5" role="status"><CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 py-8 text-center">
        <CircleAlert className="size-10 text-destructive" aria-hidden="true" />
        <h2 className="text-2xl font-semibold text-destructive">Absent</h2>
        <p className="font-medium">{result.student_name}</p>
        <p className="text-sm text-muted-foreground">{result.class_name} · {classTime}</p>
        <p className="text-sm text-muted-foreground">No attendance was marked by this tap.</p>
      </CardContent></Card>}

      {!pending && result?.status === 'no_class' && <Card role="status"><CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 py-8 text-center">
        <CalendarClock className="size-9 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-lg font-semibold">No class today</h2>
        <p className="text-sm text-muted-foreground">{result.student_name} has no class assigned to you today.</p>
      </CardContent></Card>}

      {!pending && result?.status === 'excused' && <Card role="status"><CardContent className="space-y-2 py-8 text-center">
        <h2 className="text-lg font-semibold">Excused</h2>
        <p className="text-sm text-muted-foreground">{result.student_name} has an excused attendance record. No attendance was changed.</p>
      </CardContent></Card>}

      {!pending && result && ['invalid', 'wrong_class', 'unlinked', 'forbidden'].includes(result.status) &&
        <Alert variant="destructive" role="alert"><CircleAlert className="size-4" aria-hidden="true" />
          <AlertDescription>{result.status === 'invalid' ? 'Invalid tag. Ask an administrator for a replacement.'
            : result.status === 'unlinked' ? 'Your instructor account is not linked to a teaching record.'
              : 'You are not assigned to this class. No attendance was changed.'}</AlertDescription>
        </Alert>}

      {!pending && !result && !error && <Card><CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 py-8 text-center">
        <ScanLine className="size-9 text-primary" aria-hidden="true" />
        <h2 className="text-lg font-semibold">Ready for a tag</h2>
        <p className="max-w-sm text-sm text-muted-foreground">Scan an NFC tag to see the student’s attendance status.</p>
      </CardContent></Card>}
    </section>
  )
}
