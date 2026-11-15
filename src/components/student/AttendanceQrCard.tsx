import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { CircleCheck, QrCode } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { fetchAttendanceQr, type AttendanceQr } from '@/lib/attendance-qr'
import { cn } from '@/lib/utils'

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const formatTime = (iso: string) => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : timeFormat.format(date)
}

type Loaded = AttendanceQr & { deadline: number }

/**
 * The student's attendance QR for today's booked class. The code is signed by
 * the database, only works for this student and class, and rotates every minute
 * so a forwarded screenshot quickly stops working.
 */
export default function AttendanceQrCard() {
  const [open, setOpen] = useState(false)
  const [qr, setQr] = useState<Loaded | null>(null)
  const [failed, setFailed] = useState(false)
  const [image, setImage] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async () => {
    try {
      const next = await fetchAttendanceQr()
      const deadline = Date.now() + (next.status === 'ready' ? next.refreshInMs : 0)
      setQr({ ...next, deadline })
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Rotate the code while it is on screen; wake up when check-in opens.
  useEffect(() => {
    if (!qr) return
    let delay: number | null = null
    if (qr.status === 'ready' && open) delay = Math.max(qr.deadline - Date.now(), 0)
    if (qr.status === 'upcoming') {
      const opensIn = Date.parse(qr.opensAt) - Date.now()
      if (opensIn > 0 && opensIn < 24 * 60 * 60 * 1000) delay = opensIn
    }
    if (delay === null) return
    const timer = window.setTimeout(() => void load(), delay)
    return () => window.clearTimeout(timer)
  }, [qr, open, load])

  // Background tabs throttle timers, so fetch a fresh code on return.
  useEffect(() => {
    if (!open) return
    const onVisible = () => document.visibilityState === 'visible' && void load()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [open, load])

  // Countdown to the next code.
  useEffect(() => {
    if (!open || qr?.status !== 'ready') return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [open, qr?.status])

  const payload = qr?.status === 'ready' ? qr.payload : null
  useEffect(() => {
    if (!payload) {
      setImage(null)
      return
    }
    let cancelled = false
    QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 2, width: 320 })
      .then((url) => !cancelled && setImage(url))
      .catch(() => !cancelled && setImage(null))
    return () => {
      cancelled = true
    }
  }, [payload])

  function changeOpen(next: boolean) {
    setOpen(next)
    // Never show a code that may have rotated while the dialog was closed.
    if (next) void load()
  }

  const usable = qr?.status === 'ready' || qr?.status === 'checked_in'
  const label = failed
    ? { title: 'QR unavailable', hint: 'Refresh the page to try again' }
    : !qr
      ? { title: 'Attendance QR', hint: 'Checking today’s classes…' }
      : qr.status === 'ready'
        ? { title: 'Attendance QR', hint: `Tap to check in to ${qr.className}` }
        : qr.status === 'checked_in'
          ? { title: 'Checked in', hint: qr.className }
          : qr.status === 'upcoming'
            ? { title: 'QR not open yet', hint: `Opens at ${formatTime(qr.opensAt)} for ${qr.className}` }
            : { title: 'QR unavailable', hint: 'No booked class today' }
  const secondsLeft = qr?.status === 'ready' ? Math.max(Math.ceil((qr.deadline - now) / 1000), 0) : 0

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            disabled={!usable}
            className={cn(
              'grid min-h-40 w-full place-items-center rounded-xl border border-dashed p-5 text-center transition focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed',
              usable
                ? 'border-primary/50 bg-primary/5 text-primary hover:bg-primary/10'
                : 'border-border bg-muted/50 text-muted-foreground',
            )}
          />
        }
      >
        <span className="grid justify-items-center gap-2">
          {qr?.status === 'checked_in'
            ? <CircleCheck className="size-8" aria-hidden="true" />
            : <QrCode className="size-8" aria-hidden="true" />}
          <span className="font-semibold">{label.title}</span>
          <span className="text-sm">{label.hint}</span>
        </span>
      </DialogTrigger>
      <DialogContent className="w-[calc(100%-2rem)] max-w-lg p-4 sm:max-w-lg lg:p-6">
        <div className="grid justify-items-center gap-5 py-2 text-center">
          <div>
            <DialogTitle className="text-xl font-semibold">Attendance QR</DialogTitle>
            <DialogDescription className="mt-2">
              {qr?.status === 'checked_in'
                ? `You’re checked in to ${qr.className}. Enjoy class!`
                : qr?.status === 'ready'
                  ? `Show this to your instructor to check in to ${qr.className}. The code changes every minute, so screenshots won’t work.`
                  : 'Check-in isn’t open right now.'}
            </DialogDescription>
          </div>
          {qr?.status === 'checked_in' ? (
            <CircleCheck className="size-24 text-primary" aria-hidden="true" />
          ) : qr?.status === 'ready' ? (
            <>
              <div className="grid aspect-square w-72 max-w-full place-items-center rounded-2xl bg-white p-3 sm:w-80">
                {image
                  ? <img src={image} alt={`Attendance QR code for ${qr.className}`} className="size-full" />
                  : <QrCode className="size-16 text-muted-foreground" aria-hidden="true" />}
              </div>
              <p className="text-sm text-muted-foreground tabular-nums">
                {secondsLeft > 0 ? `New code in ${secondsLeft}s` : 'Refreshing…'}
              </p>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
