import { useCallback, useEffect, useRef, useState } from 'react'
import { currentDeviceSupportsNfcCheckIn } from '@/lib/nfc-device'
import { tokenFromNdefRecords } from '@/lib/nfc-tag-reader'

type NdefReader = {
  scan: (options: { signal: AbortSignal }) => Promise<void>
  onreading: ((event: { message: { records: Iterable<{ recordType: string; data: DataView | null }> } }) => void) | null
  onreadingerror: (() => void) | null
}

/** Keep one reader alive across taps; neither the URL nor the raw token enters UI state. */
export function useNfcReader(onTag: (token: string) => void, blocked: () => boolean) {
  const [supported] = useState(currentDeviceSupportsNfcCheckIn)
  const [state, setState] = useState<'idle' | 'starting' | 'active'>('idle')
  const [error, setError] = useState('')
  const [wanted, setWanted] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const stopped = useRef(false)
  const wantedRef = useRef(false)
  const lastRead = useRef<{ token: string; at: number } | null>(null)
  const onTagRef = useRef(onTag)
  const blockedRef = useRef(blocked)
  onTagRef.current = onTag
  blockedRef.current = blocked

  const pause = useCallback(() => {
    controller.current?.abort()
    controller.current = null
    setError('')
    setState('idle')
  }, [])

  const stop = useCallback(() => {
    stopped.current = true
    wantedRef.current = false
    setWanted(false)
    pause()
  }, [pause])

  const start = useCallback(async () => {
    if (!supported || controller.current) return
    stopped.current = false
    const current = new AbortController()
    controller.current = current
    setState('starting')
    setError('')
    try {
      const Reader = (window as Window & { NDEFReader?: new () => NdefReader }).NDEFReader
      if (!Reader) throw new Error('Web NFC is unavailable in this browser.')
      const reader = new Reader()
      reader.onreading = event => {
        if (current.signal.aborted) return
        if (blockedRef.current()) return
        const token = tokenFromNdefRecords(event.message.records, window.location.origin)
        if (!token) {
          setError('This tag does not contain a valid check-in URL for this site.')
          return
        }
        if (lastRead.current?.token === token && Date.now() - lastRead.current.at < 2500) return
        lastRead.current = { token, at: Date.now() }
        setError('')
        onTagRef.current(token)
      }
      reader.onreadingerror = () => {
        if (!current.signal.aborted) setError('Unable to read that tag. Move it away and try again.')
      }
      await reader.scan({ signal: current.signal })
      if (!current.signal.aborted) {
        wantedRef.current = true
        setWanted(true)
        setState('active')
      }
    } catch (failure) {
      if (!current.signal.aborted) {
        setState('idle')
        setError(failure instanceof DOMException && failure.name === 'NotAllowedError'
          ? 'Allow NFC access to scan tags, then try again.'
          : 'Unable to start NFC scanning. Check that NFC is on and try again.')
      }
      if (controller.current === current) controller.current = null
    }
  }, [supported])

  const resume = useCallback(() => {
    if (wantedRef.current && !stopped.current) void start()
  }, [start])

  useEffect(() => {
    if (!supported || !navigator.permissions?.query) return
    let cancelled = false
    const autoStart = () => {
      if (document.visibilityState !== 'visible') return
      void navigator.permissions.query({ name: 'nfc' as PermissionName }).then(permission => {
        if (!cancelled && !stopped.current && !wantedRef.current && permission.state === 'granted' && document.visibilityState === 'visible') void start()
      }).catch(() => { /* Unknown permission state: require a tap on Start scanning. */ })
    }
    autoStart()
    document.addEventListener('visibilitychange', autoStart)
    return () => { cancelled = true; document.removeEventListener('visibilitychange', autoStart) }
  }, [supported, start])

  useEffect(() => () => { controller.current?.abort(); controller.current = null }, [])
  return { supported, state, error, wanted, start, stop, pause, resume }
}
