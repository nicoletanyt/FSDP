// Test-only capability simulation. No device overrides or mocked check-in
// requests are imported by the production app.
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router'
import NfcCheckIn from '../../src/pages/Instructor/NfcCheckIn'
import { pendingNfcTagKey } from '../../src/components/instructor/NfcTagCapture'
import { supabase } from '../../src/lib/supabase'
import '../../src/index.css'

declare global {
  interface Window {
    nfcFixtureCalls: number
    nfcFixtureScans: number
    nfcFixtureEmit: (token?: string, kind?: 'url' | 'text') => void
    nfcFixtureRespond: (status: string) => void
  }
}

const params = new URLSearchParams(location.search)
const device = params.get('device') ?? 'desktop'
const android = `Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${device === 'old-chrome' ? 88 : 131}.0.0.0 Mobile Safari/537.36`
const userAgent = device === 'ios' ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1'
  : device === 'desktop' ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'
    : device === 'tablet' ? android.replace(' Mobile', '')
      : device === 'edge' ? `${android} EdgA/131.0.0.0` : android
Object.defineProperty(navigator, 'userAgent', { configurable: true, value: userAgent })
Object.defineProperty(navigator, 'userAgentData', { configurable: true, value: undefined })
type FixtureReader = { onreading: ((event: { message: { records: { recordType: string; data: DataView }[] } }) => void) | null }
let reader: FixtureReader | null = null
window.nfcFixtureScans = 0
window.nfcFixtureEmit = (token = 'a'.repeat(64), kind = 'url') => {
  const data = kind === 'url' ? `${location.origin}/instructor/nfc_checkin?tag=${token}` : token
  const bytes = new TextEncoder().encode(data)
  reader?.onreading?.({ message: { records: [{ recordType: kind, data: new DataView(bytes.buffer) }] } })
}
let responseStatus = 'no_class'
window.nfcFixtureRespond = status => { responseStatus = status }
class MockNdefReader {
  onreading: FixtureReader['onreading'] = null
  onreadingerror: (() => void) | null = null
  async scan({ signal }: { signal: AbortSignal }) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    reader = this
    window.nfcFixtureScans++
    signal.addEventListener('abort', () => { if (reader === this) reader = null }, { once: true })
  }
}
Object.defineProperty(window, 'NDEFReader', { configurable: true, value: ['no-api', 'ios', 'desktop'].includes(device) ? undefined : MockNdefReader })
Object.defineProperty(navigator, 'permissions', { configurable: true, value: {
  query: async () => ({ state: device === 'granted' ? 'granted' : 'prompt' }),
} })
if (device === 'insecure') Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false })

sessionStorage.removeItem(pendingNfcTagKey)
if (params.has('tag')) sessionStorage.setItem(pendingNfcTagKey, 'a'.repeat(64))
window.nfcFixtureCalls = 0
Object.defineProperty(supabase, 'functions', { configurable: true, value: {
  invoke: async () => {
    window.nfcFixtureCalls++
    return { data: responseStatus === 'select_class'
      ? { status: 'select_class', student_name: 'Test student', classes: [{ event_id: 'class-1', class_name: 'Demo class', starts_at: '2026-11-13T09:00:00Z', ends_at: '2026-11-13T10:00:00Z' }] }
      : { status: 'no_class', student_name: 'Test student' }, error: null }
  },
} })

createRoot(document.getElementById('root')!).render(
  <MemoryRouter initialEntries={['/instructor/nfc_checkin']}>
    <main className="mx-auto w-full max-w-6xl p-6">
      <Routes>
        <Route path="/instructor/nfc_checkin" element={<NfcCheckIn />} />
        <Route path="/instructor/check-in" element={<h1>QR check-in fixture</h1>} />
      </Routes>
    </main>
  </MemoryRouter>,
)
