/** Camera helpers — secure context, Edge-safe constraints, clear errors. */

const CONSTRAINT_LADDER: MediaStreamConstraints[] = [
  {
    video: {
      width: { ideal: 640, max: 1280 },
      height: { ideal: 480, max: 720 },
      facingMode: 'user',
    },
    audio: false,
  },
  {
    video: {
      width: { ideal: 640 },
      height: { ideal: 480 },
      facingMode: 'user',
    },
    audio: false,
  },
  { video: { facingMode: 'user' }, audio: false },
  { video: true, audio: false },
]

export function isSecureCameraContext(): boolean {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  return (
    window.isSecureContext ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]'
  )
}

export function hasCameraApi(): boolean {
  return Boolean(
    typeof navigator !== 'undefined' &&
      navigator.mediaDevices?.getUserMedia,
  )
}

export function formatCameraError(err: unknown): string {
  if (err instanceof DOMException) {
    switch (err.name) {
      case 'NotAllowedError':
        return 'Camera blocked. Allow camera for this site in browser settings, then click Enable camera again.'
      case 'NotFoundError':
        return 'No camera found. Plug in a webcam or enable the built-in camera.'
      case 'NotReadableError':
        return 'Camera is in use by another app (Zoom, Teams, etc.). Close it and try again.'
      case 'OverconstrainedError':
        return 'Camera does not support the requested settings. Try another browser or update Edge/Chrome.'
      case 'SecurityError':
        return 'Camera needs a secure page (https://). Do not open the built files directly from disk — use the GitHub Pages link or localhost.'
      default:
        return err.message || `Camera error (${err.name}).`
    }
  }
  if (err instanceof Error) return err.message
  return 'Camera access failed. Allow webcam permissions and try again.'
}

export async function acquireCameraStream(): Promise<MediaStream> {
  if (!hasCameraApi()) {
    throw new Error(
      'Camera API not available. Use a recent Chrome, Edge, or Firefox.',
    )
  }
  if (!isSecureCameraContext()) {
    throw new Error(
      'Camera only works on HTTPS or localhost. Use the live demo link (GitHub Pages) or run: npm run dev',
    )
  }

  let lastError: unknown
  for (const constraints of CONSTRAINT_LADDER) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints)
    } catch (e) {
      lastError = e
      if (e instanceof DOMException && e.name === 'NotAllowedError') {
        break
      }
    }
  }
  throw lastError ?? new Error('Could not open camera.')
}

export async function waitForVideoElement(
  getVideo: () => HTMLVideoElement | null,
  timeoutMs = 3000,
): Promise<HTMLVideoElement> {
  const start = performance.now()
  while (performance.now() - start < timeoutMs) {
    const el = getVideo()
    if (el) return el
    await new Promise((r) => requestAnimationFrame(r))
  }
  throw new Error('Camera preview not ready. Refresh the page and try again.')
}

/** Attach stream and play — muted + playsInline required for autoplay policies. */
export async function attachStreamToVideo(
  video: HTMLVideoElement,
  stream: MediaStream,
): Promise<void> {
  video.srcObject = stream
  video.muted = true
  video.playsInline = true
  video.autoplay = true
  video.setAttribute('playsinline', 'true')

  try {
    await video.play()
  } catch {
    // Retry once after metadata (Edge sometimes needs loadeddata first).
    await new Promise<void>((resolve) => {
      const onReady = () => {
        video.removeEventListener('loadeddata', onReady)
        resolve()
      }
      video.addEventListener('loadeddata', onReady)
      setTimeout(() => {
        video.removeEventListener('loadeddata', onReady)
        resolve()
      }, 1500)
    })
    await video.play()
  }
}
