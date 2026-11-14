import jsQR from 'jsqr'

type Frame = { pixels: ArrayBuffer; width: number; height: number }
type Reply = { payload: string | null; failed?: boolean }

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Frame>) => void) | null
  postMessage: (message: Reply) => void
}

scope.onmessage = ({ data }) => {
  try {
    const code = jsQR(new Uint8ClampedArray(data.pixels), data.width, data.height, { inversionAttempts: 'attemptBoth' })
    // The code remains transient in memory and is sent only to the owning page.
    scope.postMessage({ payload: code?.data ?? null })
  } catch {
    scope.postMessage({ payload: null, failed: true })
  }
}
