import { useLayoutEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router'

export const pendingNfcTagKey = 'fsdp-pending-nfc-tag'

// Capture before the instructor sign-in guard redirects; strip the token from
// the address bar so a copied page URL cannot be used as a tag.
export default function NfcTagCapture() {
  const location = useLocation()
  const [capturedKey, setCapturedKey] = useState<string | null>(null)
  const params = new URLSearchParams(location.search)
  const hasTag = location.pathname === '/instructor/nfc_checkin' && params.has('tag')

  useLayoutEffect(() => {
    if (!hasTag) return
    const params = new URLSearchParams(location.search)
    const token = params.get('tag') ?? ''
    sessionStorage.setItem(pendingNfcTagKey, /^[0-9a-f]{64}$/i.test(token) ? token.toLowerCase() : 'invalid')
    params.delete('tag')
    // Removing the token must not depend on a second router navigation. That
    // navigation could leave this wrapper rendering null indefinitely on phone.
    const search = params.toString()
    window.history.replaceState(window.history.state, '',
      `${location.pathname}${search ? `?${search}` : ''}${location.hash}`)
    setCapturedKey(location.key)
  }, [hasTag, location.hash, location.key, location.pathname, location.search])

  // Keep the child unmounted until the token is in sessionStorage. A new tap
  // (or a second tag in this tab) gets a fresh route key and a fresh scan page.
  // Only the check-in page remounts per navigation: elsewhere every URL change
  // (e.g. a search keystroke) would tear the page down and lose focus.
  const isCheckIn = location.pathname === '/instructor/nfc_checkin'
  return hasTag && capturedKey !== location.key ? null : <Outlet key={isCheckIn ? location.key : 'instructor'} />
}
