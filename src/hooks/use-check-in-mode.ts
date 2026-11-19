import { useCallback, useEffect, useState } from 'react'

/** Only one reader is selected at a time. Wait for camera cleanup before starting NFC. */
export function useCheckInMode({
  nfcSupported, nfcState, cameraRunning, startNfc, stopNfc,
}: {
  nfcSupported: boolean
  nfcState: 'idle' | 'starting' | 'active'
  cameraRunning: boolean
  startNfc: () => Promise<void>
  stopNfc: () => void
}) {
  const [mode, setMode] = useState<'nfc' | 'qr'>(() => nfcSupported ? 'nfc' : 'qr')
  const [pendingNfcStart, setPendingNfcStart] = useState(false)

  const startCamera = useCallback(() => {
    setPendingNfcStart(false)
    stopNfc()
    setMode('qr')
  }, [stopNfc])

  const startNfcScanning = useCallback(() => {
    if (!nfcSupported) return
    // First-time NFC permission needs the button's user gesture, not an effect.
    if (mode === 'nfc' && !cameraRunning && nfcState === 'idle') {
      void startNfc()
      return
    }
    setMode('nfc')
    setPendingNfcStart(true)
  }, [nfcSupported, mode, cameraRunning, nfcState, startNfc])

  useEffect(() => {
    if (mode !== 'nfc' || !pendingNfcStart || cameraRunning || nfcState !== 'idle') return
    setPendingNfcStart(false)
    void startNfc()
  }, [mode, pendingNfcStart, cameraRunning, nfcState, startNfc])

  return { mode, cameraEnabled: mode === 'qr', startCamera, startNfcScanning }
}
