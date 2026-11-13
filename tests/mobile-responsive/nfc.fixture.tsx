// Test-only capability simulation. No device overrides or mocked check-in
// requests are imported by the production app.
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router'
import NfcCheckIn from '../../src/pages/Instructor/NfcCheckIn'
import { pendingNfcTagKey } from '../../src/components/instructor/NfcTagCapture'
import { supabase } from '../../src/lib/supabase'
import '../../src/index.css'

declare global {
  interface Window { nfcFixtureCalls: number }
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
Object.defineProperty(window, 'NDEFReader', { configurable: true, value: ['no-api', 'ios', 'desktop'].includes(device) ? undefined : function NDEFReader() {} })
if (device === 'insecure') Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false })

sessionStorage.removeItem(pendingNfcTagKey)
if (params.has('tag')) sessionStorage.setItem(pendingNfcTagKey, 'a'.repeat(64))
window.nfcFixtureCalls = 0
Object.defineProperty(supabase, 'functions', { configurable: true, value: {
  invoke: async () => {
    window.nfcFixtureCalls++
    return { data: { status: 'no_class', student_name: 'Test student' }, error: null }
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
