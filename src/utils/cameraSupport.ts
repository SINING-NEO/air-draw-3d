/** Camera helpers — secure context, Edge-safe constraints, clear errors. */

/** Simplest first — Edge rejects strict combos more often. */
const CONSTRAINT_LADDER: MediaStreamConstraints[] = [
  { video: true, audio: false },
  { video: { facingMode: 'user' }, audio: false },
  {
    video: {
      width: { ideal: 640 },
      height: { ideal: 480 },
      facingMode: 'user',
    },
    audio: false,
  },
  {
    video: {
      width: { ideal: 640, max: 1280 },
      height: { ideal: 480, max: 720 },
      facingMode: 'user',
    },
    audio: false,
  },
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
        return 'Camera blocked. In Edge: Settings → Cookies and site permissions → Camera → allow this site, then click Enable camera again.'
      case 'NotFoundError':
        return 'No camera found. Plug in a webcam or enable the built-in camera.'
      case 'NotReadableError':
        return 'Camera is in use by another app (Zoom, Teams, etc.). Close it and try again.'
      case 'OverconstrainedError':
        return 'Camera does not support the requested settings. Click Try again — we will use simpler settings.'
      case 'SecurityError':
        return 'Camera needs HTTPS. Use https://sining-neo.github.io/air-draw-3d/ or run npm run dev — not a file opened from disk.'
      case 'AbortError':
        return 'Camera request was cancelled. Click Enable camera again.'
      default:
        return err.message || `Camera error (${err.name}).`
    }
  }
  if (err instanceof Error) return err.message
  return 'Camera access failed. Allow webcam permissions and try again.'
}

/**
 * Call as the first await inside a click handler — Edge drops user activation
 * if other awaits run before getUserMedia.
 */
export async function acquireCameraStream(): Promise<MediaStream> {
  if (!hasCameraApi()) {
    throw new Error(
      'Camera API not available. Use Microsoft Edge (Chromium) or Chrome — not Internet Explorer.',
    )
  }
  if (!isSecureCameraContext()) {
    throw new Error(
      'Camera only works on HTTPS or localhost. Use the GitHub Pages demo or npm run dev.',
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

export function getVideoElement(
  getVideo: () => HTMLVideoElement | null,
): HTMLVideoElement {
  const el = getVideo()
  if (!el) {
    throw new Error('Camera preview not ready. Refresh the page and try again.')
  }
  return el
}

function waitForVideoFrame(video: HTMLVideoElement, timeoutMs = 8000): Promise<void> {
  if (video.videoWidth > 0 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    const onFrame = () => {
      if (video.videoWidth > 0) {
        cleanup()
        resolve()
      }
    }
    const onError = () => {
      cleanup()
      reject(new Error('Camera video failed to load frames.'))
    }
    const timer = window.setTimeout(() => {
      cleanup()
      if (video.videoWidth > 0) resolve()
      else reject(new Error('Camera feed timed out. Click Enable camera again.'))
    }, timeoutMs)

    const cleanup = () => {
      video.removeEventListener('loadeddata', onFrame)
      video.removeEventListener('canplay', onFrame)
      video.removeEventListener('playing', onFrame)
      video.removeEventListener('error', onError)
      window.clearTimeout(timer)
    }

    video.addEventListener('loadeddata', onFrame)
    video.addEventListener('canplay', onFrame)
    video.addEventListener('playing', onFrame)
    video.addEventListener('error', onError)
  })
}

function waitForVideoMetadata(video: HTMLVideoElement, timeoutMs = 5000): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    const onMeta = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('Camera video failed to load.'))
    }
    const timer = window.setTimeout(() => {
      cleanup()
      resolve()
    }, timeoutMs)

    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onMeta)
      video.removeEventListener('error', onError)
      window.clearTimeout(timer)
    }

    video.addEventListener('loadedmetadata', onMeta)
    video.addEventListener('error', onError)
  })
}

/** Attach stream and play — muted + playsInline required for autoplay policies. */
export async function attachStreamToVideo(
  video: HTMLVideoElement,
  stream: MediaStream,
): Promise<void> {
  for (const track of stream.getVideoTracks()) {
    track.enabled = true
  }

  video.srcObject = stream
  video.muted = true
  video.defaultMuted = true
  video.playsInline = true
  video.autoplay = true
  video.setAttribute('playsinline', 'true')
  video.setAttribute('webkit-playsinline', 'true')

  await waitForVideoMetadata(video)

  await waitForVideoFrame(video)

  try {
    await video.play()
  } catch (playErr) {
    await waitForVideoMetadata(video, 2000)
    try {
      await video.play()
    } catch {
      throw playErr instanceof Error
        ? playErr
        : new Error('Could not start camera preview. Click Enable camera again.')
    }
  }

  if (video.videoWidth === 0 || video.videoHeight === 0) {
    throw new Error('Camera opened but video has no size. Try another browser or camera.')
  }
}
