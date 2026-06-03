import { useEffect, useRef, useState } from 'react'
import type { HandRole, HandState } from '../types/hand'
import { acquireCameraStream, formatCameraError } from '../utils/cameraSupport'
import { drawHandSkeleton, drawZoomFocalPoints } from '../utils/handDrawing'
import { HandOverlaySmoother } from '../utils/handOverlaySmoother'

interface CameraPreviewProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
  handState: HandState
  handStateRef: React.RefObject<HandState>
  isReady: boolean
  isStarting: boolean
  loadingStage: string | null
  cameraActive: boolean
  error: string | null
  onStartCamera: (stream: MediaStream) => Promise<void>
  onCameraError: (message: string) => void
  onCameraStart?: () => void
}

const ROLE_COLORS: Record<
  HandRole,
  { connector: string; landmark: string; active: boolean }
> = {
  draw: { connector: '#22d3ee', landmark: '#f0fdff', active: true },
  navigate: { connector: '#a78bfa', landmark: '#ede9fe', active: true },
  zoom: { connector: '#fbbf24', landmark: '#fef9c3', active: true },
  open: { connector: '#64748b', landmark: '#94a3b8', active: false },
  idle: { connector: '#818cf8', landmark: '#c7d2fe', active: false },
}

export function CameraPreview({
  videoRef,
  handState,
  handStateRef,
  isReady,
  isStarting,
  loadingStage,
  cameraActive,
  error,
  onStartCamera,
  onCameraError,
  onCameraStart,
}: CameraPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const smootherRef = useRef(new HandOverlaySmoother())
  const sizeRef = useRef({ w: 0, h: 0 })
  const [previewLive, setPreviewLive] = useState(false)

  const enableCamera = async () => {
    if (isStarting) return
    onCameraStart?.()
    setPreviewLive(false)
    try {
      const stream = await acquireCameraStream()
      await onStartCamera(stream)
    } catch (err) {
      onCameraError(formatCameraError(err))
    }
  }

  useEffect(() => {
    if (!cameraActive) {
      setPreviewLive(false)
    }
  }, [cameraActive])

  useEffect(() => {
    let frameId = 0
    let lastTime = performance.now()

    function syncCanvasSize(videoEl: HTMLVideoElement, canvasEl: HTMLCanvasElement) {
      const w = videoEl.videoWidth || 640
      const h = videoEl.videoHeight || 480
      if (sizeRef.current.w === w && sizeRef.current.h === h) return
      sizeRef.current = { w, h }
      canvasEl.width = w
      canvasEl.height = h
    }

    function draw(now: number) {
      frameId = requestAnimationFrame(draw)
      const videoEl = videoRef.current
      const canvasEl = canvasRef.current
      if (!videoEl || !canvasEl) return

      const hasFrame =
        videoEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        videoEl.videoWidth > 0 &&
        videoEl.videoHeight > 0

      if (!hasFrame) return

      syncCanvasSize(videoEl, canvasEl)
      setPreviewLive(true)

      const ctx = canvasEl.getContext('2d', { alpha: false })
      if (!ctx) return

      const dt = Math.min((now - lastTime) / 1000, 0.05)
      lastTime = now
      const follow = 1 - Math.pow(0.04, dt * 60)

      const w = canvasEl.width
      const h = canvasEl.height

      ctx.fillStyle = '#050510'
      ctx.fillRect(0, 0, w, h)

      // Edge often shows a black <video> — draw frames on canvas instead.
      ctx.save()
      ctx.translate(w, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(videoEl, 0, 0, w, h)
      ctx.restore()

      const state = handStateRef.current

      if (state.hands.length > 0) {
        const rawHands = state.hands.map((hand) => hand.landmarks)
        const smoothHands = smootherRef.current.update(rawHands, follow)

        for (let i = 0; i < smoothHands.length; i++) {
          const hand = state.hands[i]
          if (!hand) continue

          const landmarks = smoothHands[i].map((lm) => ({
            x: lm.x * w,
            y: lm.y * h,
          }))

          const colors = ROLE_COLORS[hand.role]
          drawHandSkeleton(ctx, landmarks, {
            connectorColor: colors.connector,
            landmarkColor: colors.landmark,
            isDrawing: colors.active,
          })
        }
      } else {
        smootherRef.current.reset()
      }

      if (state.zoomFocalPoints) {
        drawZoomFocalPoints(
          ctx,
          state.zoomFocalPoints,
          w,
          h,
          state.isZooming,
        )
      }
    }

    frameId = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frameId)
      smootherRef.current.reset()
    }
  }, [handStateRef, videoRef])

  const showGate = !cameraActive && !error
  const showLoading =
    cameraActive && !previewLive && !error && (isStarting || !isReady)

  const dualActive =
    handState.twoHandMode &&
    handState.isDrawing &&
    (handState.isNavigating || handState.isZooming)

  return (
    <div className="camera-preview">
      <video
        ref={videoRef}
        className="camera-video"
        playsInline
        muted
        autoPlay
        aria-hidden
      />
      <canvas ref={canvasRef} className="camera-overlay" />

      {showGate && (
        <div className="camera-status camera-gate">
          <p>Click to allow your webcam (required for hand tracking).</p>
          <button
            type="button"
            className="camera-enable-btn"
            disabled={isStarting}
            onClick={() => void enableCamera()}
          >
            {isStarting ? loadingStage ?? 'Starting…' : 'Enable camera'}
          </button>
        </div>
      )}
      {showLoading && (
        <div className="camera-status">
          {loadingStage ?? 'Starting camera…'}
        </div>
      )}
      {error && (
        <div className="camera-status error">
          <p>{error}</p>
          <button
            type="button"
            className="camera-enable-btn"
            disabled={isStarting}
            onClick={() => void enableCamera()}
          >
            Try again
          </button>
        </div>
      )}

      {cameraActive && previewLive && (
        <div className="camera-live-badge">Live</div>
      )}

      <div className="camera-badges">
        {handState.isPaused && (
          <div className="open-hand-badge">Paused</div>
        )}
        {dualActive && <div className="dual-badge">Two-hand mode</div>}
        {handState.isDrawing && <div className="drawing-badge">Drawing</div>}
        {handState.isNavigating && !handState.isZooming && (
          <div className="nav-badge">Head look</div>
        )}
        {handState.isZooming && !handState.isNavigating && (
          <div className="zoom-badge">Moving</div>
        )}
      </div>
    </div>
  )
}
