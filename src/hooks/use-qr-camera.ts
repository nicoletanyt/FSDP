import { useEffect, useRef, useState } from 'react'

type CameraStatus = 'stopped' | 'starting' | 'live' | 'error'

// Bound camera sampling and worker CPU use on a phone.
const scanIntervalMs = 1000 / 5

function cameraError(error: unknown) {
  const name = error instanceof Error ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Camera access was denied. Allow camera access in your browser settings, then try again.'
  }
  if (name === 'NotFoundError') return 'No camera was found. Connect a camera, or ask your instructor to mark attendance in Calendar.'
  if (name === 'NotReadableError' || name === 'AbortError') {
    return 'The camera is unavailable. Close other apps using it, then try again.'
  }
  if (name === 'OverconstrainedError') return 'This camera is no longer available. Select another camera.'
  return 'Unable to start the camera. Try again, or ask your instructor to mark attendance in Calendar.'
}

export function useQrCamera({
  enabled,
  cameraId,
  paused,
  onScan,
}: {
  enabled: boolean
  cameraId: string
  paused: boolean
  onScan: (payload: string) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const onScanRef = useRef(onScan)
  const pausedRef = useRef(paused)
  const [status, setStatus] = useState<CameraStatus>('stopped')
  const [error, setError] = useState('')
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [activeCameraId, setActiveCameraId] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [visible, setVisible] = useState(() => !document.hidden)

  useEffect(() => { onScanRef.current = onScan }, [onScan])
  useEffect(() => { pausedRef.current = paused }, [paused])

  useEffect(() => {
    const onVisibilityChange = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  useEffect(() => {
    if (!enabled || !visible) {
      setStatus('stopped')
      return
    }

    let disposed = false
    let stream: MediaStream | undefined
    let worker: Worker | undefined
    let decoding = false
    let failed = false
    let frame = 0
    let lastScan = 0
    const video = videoRef.current
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d', { willReadFrequently: true })

    function releaseCamera() {
      cancelAnimationFrame(frame)
      worker?.terminate()
      worker = undefined
      stream?.getTracks().forEach(track => track.stop())
      if (video && video.srcObject === stream) video.srcObject = null
    }

    function decoderError() {
      if (disposed || failed) return
      failed = true
      releaseCamera()
      setError('QR decoding stopped. Try restarting the camera.')
      setStatus('error')
    }

    function scan(time: number) {
      if (disposed || failed) return
      frame = requestAnimationFrame(scan)
      if (decoding || pausedRef.current || time - lastScan < scanIntervalMs || !video || !context || !worker || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return
      lastScan = time

      // Downsample before transferring the frame; QR decoding runs off the UI thread.
      const scale = Math.min(1, 480 / Math.max(video.videoWidth, video.videoHeight))
      const width = Math.max(1, Math.round(video.videoWidth * scale))
      const height = Math.max(1, Math.round(video.videoHeight * scale))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      // Decode every edge of the native frame, independently of the preview's layout.
      context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, width, height)
      const image = context.getImageData(0, 0, canvas.width, canvas.height)
      decoding = true
      try {
        // Transfer pixels instead of copying them; only one frame is in flight.
        worker.postMessage({ pixels: image.data.buffer, width, height }, [image.data.buffer])
      } catch {
        decoderError()
      }
    }

    async function start() {
      setStatus('starting')
      setError('')
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera access requires HTTPS or localhost and a supported browser.')
        }
        if (!video || !context) throw new Error('The camera preview is unavailable.')
        worker = new Worker(new URL('../workers/qr-decode.worker.ts', import.meta.url), { type: 'module' })
        worker.onmessage = (event: MessageEvent<{ payload: string | null; failed?: boolean }>) => {
          if (disposed || failed) return
          decoding = false
          if (event.data.failed) { decoderError(); return }
          if (event.data.payload && !pausedRef.current) onScanRef.current(event.data.payload)
        }
        worker.onerror = decoderError
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            ...(cameraId ? { deviceId: { exact: cameraId } } : { facingMode: { ideal: 'environment' } }),
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        })
        // A permission prompt can resolve after navigation, stopping, or a camera switch.
        if (disposed) { releaseCamera(); return }
        video.srcObject = stream
        await video.play()
        if (disposed) { releaseCamera(); return }
        setActiveCameraId(stream.getVideoTracks()[0]?.getSettings().deviceId ?? '')
        stream.getVideoTracks().forEach(track => track.addEventListener('ended', () => {
          if (disposed) return
          releaseCamera()
          setError('The camera disconnected. Stop and restart it, or select another camera.')
          setStatus('error')
        }))
        setStatus('live')
        frame = requestAnimationFrame(scan)
        try {
          const devices = await navigator.mediaDevices.enumerateDevices()
          if (!disposed) setCameras(devices.filter(device => device.kind === 'videoinput'))
        } catch { /* Scanning still works when camera enumeration is unavailable. */ }
      } catch (failure) {
        releaseCamera()
        if (disposed) return
        setError(!navigator.mediaDevices?.getUserMedia
          ? 'Camera access requires HTTPS or localhost and a supported browser.'
          : cameraError(failure))
        setStatus('error')
      }
    }

    void start()
    return () => { disposed = true; releaseCamera() }
  }, [enabled, cameraId, visible, attempt])

  return { videoRef, status, error, cameras, activeCameraId, restart: () => setAttempt(current => current + 1) }
}
