export interface NfcDeviceCapabilities {
  userAgent: string
  platform?: string
  secureContext: boolean
  hasNdefReader: boolean
}

// Feature detection is required: Android/Chromium alone does not guarantee Web
// NFC support. The physical adapter and its enabled state cannot be checked
// reliably without starting a scan (which can require a permission prompt).
export function supportsNfcCheckIn(device: NfcDeviceCapabilities): boolean {
  const android = device.platform === 'Android' || /\bAndroid\b/i.test(device.userAgent)
  const chromium = /\bChrome\/(\d+)/.exec(device.userAgent)
  return android && device.secureContext && device.hasNdefReader
    && (!chromium || Number(chromium[1]) >= 89)
}

export function currentDeviceSupportsNfcCheckIn(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  const browser = navigator as Navigator & { userAgentData?: { platform?: string } }
  return supportsNfcCheckIn({
    userAgent: browser.userAgent,
    platform: browser.userAgentData?.platform,
    secureContext: window.isSecureContext,
    hasNdefReader: typeof (window as Window & { NDEFReader?: unknown }).NDEFReader === 'function',
  })
}
