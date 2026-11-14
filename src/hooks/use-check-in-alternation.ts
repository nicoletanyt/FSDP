import { useEffect, useState } from 'react'

const QR_WINDOW_MS = 4000
const NFC_WINDOW_MS = 3000

/** Web NFC can stop delivering events while the camera is open on some phones.
 * Release each reader before activating the other; wait for a live reader before
 * starting its window. Nothing is submitted by this timer. */
export function useCheckInAlternation({
  cameraEnabled, cameraRunning, cameraLive, cameraFailed, nfcWanted, nfcState, nfcError,
  pauseNfc, resumeNfc, stopNfc, busy, locked,
}: {
  cameraEnabled: boolean
  cameraRunning: boolean
  cameraLive: boolean
  cameraFailed: boolean
  nfcWanted: boolean
  nfcState: 'idle' | 'starting' | 'active'
  nfcError: string
  pauseNfc: () => void
  resumeNfc: () => void
  stopNfc: () => void
  busy: boolean
  locked: () => boolean
}) {
  const [phase, setPhase] = useState<'qr' | 'nfc'>('qr')
  const [cameraPaused, setCameraPaused] = useState(false)
  const [visible, setVisible] = useState(() => !document.hidden)
  const alternating = nfcWanted && cameraEnabled && !cameraFailed

  useEffect(() => {
    const onVisibilityChange = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  useEffect(() => {
    if (!alternating) {
      setCameraPaused(false)
      setPhase('qr')
    } else if (phase === 'qr') {
      pauseNfc()
      setCameraPaused(false)
    } else {
      setCameraPaused(true)
    }
  }, [alternating, phase, pauseNfc])

  useEffect(() => {
    if (alternating && phase === 'nfc' && cameraPaused && !cameraRunning) resumeNfc()
    if (!alternating && nfcWanted && !cameraRunning) resumeNfc()
  }, [alternating, phase, cameraPaused, cameraRunning, nfcWanted, resumeNfc])

  useEffect(() => {
    // A failed restart must not strand the station with its camera off.
    if (alternating && phase === 'nfc' && !cameraRunning && nfcState === 'idle' && nfcError) stopNfc()
  }, [alternating, phase, cameraRunning, nfcState, nfcError, stopNfc])

  useEffect(() => {
    if (!alternating || busy || !visible) return
    if (phase === 'qr' && !cameraLive) return
    if (phase === 'nfc' && (cameraRunning || nfcState !== 'active')) return
    const timeout = window.setTimeout(() => {
      if (!locked()) setPhase(current => current === 'qr' ? 'nfc' : 'qr')
    }, phase === 'qr' ? QR_WINDOW_MS : NFC_WINDOW_MS)
    return () => window.clearTimeout(timeout)
  }, [alternating, busy, visible, phase, cameraLive, cameraRunning, nfcState, locked])

  return { alternating, phase, cameraPaused }
}
