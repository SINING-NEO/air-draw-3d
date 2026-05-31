import { useEffect, useRef } from 'react'
import type { HandRole, HandState } from '../types/hand'
import { drawHandSkeleton, drawZoomFocalPoints } from '../utils/handDrawing'
import { HandOverlaySmoother } from '../utils/handOverlaySmoother'

interface CameraPreviewProps {
  handState: HandState
  handStateRef: React.RefObject<HandState>
  isReady: boolean
  error: string | null
  onVideoRef: (el: HTMLVideoElement | null) => void
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
  handState,
  handStateRef,
  isReady,
  error,
  onVideoRef,
}: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const smootherRef = useRef(new HandOverlaySmoother())
  const sizeRef = useRef({ w: 0, h: 0 })

  useEffect(() => {
    onVideoRef(videoRef.current)
  }, [onVideoRef])

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
      if (!videoEl || !canvasEl || videoEl.readyState < 2) return

      syncCanvasSize(videoEl, canvasEl)

      const ctx = canvasEl.getContext('2d', { alpha: true })
      if (!ctx) return

      const dt = Math.min((now - lastTime) / 1000, 0.05)
      lastTime = now
      const follow = 1 - Math.pow(0.04, dt * 60)

      const state = handStateRef.current
      const w = canvasEl.width
      const h = canvasEl.height

      ctx.clearRect(0, 0, w, h)

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
  }, [handStateRef])

  const dualActive =
    handState.twoHandMode &&
    handState.isDrawing &&
    (handState.isNavigating || handState.isZooming)

  return (
    <div className="camera-preview">
      <video ref={videoRef} className="camera-video" playsInline muted />
      <canvas ref={canvasRef} className="camera-overlay" />

      {!isReady && !error && (
        <div className="camera-status">Starting camera & hand tracking…</div>
      )}
      {error && <div className="camera-status error">{error}</div>}

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
