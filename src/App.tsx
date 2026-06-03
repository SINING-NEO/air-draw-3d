import { useCallback, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_ROTATION_SENSITIVITY,
  DEFAULT_TRACKING_SENSITIVITY,
  DEFAULT_ZOOM_SENSITIVITY,
  maxSegmentLength,
  minPointDistance,
} from './config/tracking'
import { CameraPreview } from './components/CameraPreview'
import { Scene3D } from './components/Scene3D'
import { SceneErrorBoundary } from './components/SceneErrorBoundary'
import { Toolbar } from './components/Toolbar'
import { useHandTracking } from './hooks/useHandTracking'
import type { DrawMode, Stroke, TrackingSettings } from './types/hand'
import { interpolatePoints } from './utils/drawSmoothing'
import { pointDistance } from './utils/handMapping'
import './App.css'

function newStrokeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function createStroke(color: string, width: number, point: [number, number, number]): Stroke {
  return {
    id: newStrokeId(),
    color,
    width,
    points: [point],
  }
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [brushColor, setBrushColor] = useState('#22d3ee')
  const [brushWidth, setBrushWidth] = useState(0.05)
  const [drawMode, setDrawMode] = useState<DrawMode>('pinch')
  const [trackingSensitivity, setTrackingSensitivity] = useState(
    DEFAULT_TRACKING_SENSITIVITY,
  )
  const [rotationSensitivity, setRotationSensitivity] = useState(
    DEFAULT_ROTATION_SENSITIVITY,
  )
  const [zoomSensitivity, setZoomSensitivity] = useState(DEFAULT_ZOOM_SENSITIVITY)
  const [viewResetKey, setViewResetKey] = useState(0)
  const currentStrokeRef = useRef<Stroke | null>(null)
  const brushColorRef = useRef(brushColor)
  const brushWidthRef = useRef(brushWidth)
  const settingsRef = useRef<TrackingSettings>({
    trackingSensitivity,
    rotationSensitivity,
    zoomSensitivity,
  })

  brushColorRef.current = brushColor
  brushWidthRef.current = brushWidth

  const trackingSettings = useMemo<TrackingSettings>(
    () => ({
      trackingSensitivity,
      rotationSensitivity,
      zoomSensitivity,
    }),
    [trackingSensitivity, rotationSensitivity, zoomSensitivity],
  )

  const {
    handState,
    handStateRef,
    isReady,
    isStarting,
    loadingStage,
    error,
    cameraActive,
    startCamera,
    reportError,
    beginCameraStart,
  } = useHandTracking(videoRef, drawMode, trackingSettings)

  settingsRef.current = trackingSettings

  const appendPoints = useCallback((points: [number, number, number][]) => {
    if (points.length === 0) return

    let current = currentStrokeRef.current
    const settings = settingsRef.current
    const minDist = minPointDistance(settings.trackingSensitivity)
    const maxSeg = maxSegmentLength(settings.trackingSensitivity)

    for (const point of points) {
      if (!current) {
        current = createStroke(brushColorRef.current, brushWidthRef.current, point)
        currentStrokeRef.current = current
        setStrokes((prev) => [...prev, current!])
        continue
      }

      const last = current.points[current.points.length - 1]
      const gap = pointDistance(last, point)

      if (gap < minDist) continue

      const fill =
        gap > maxSeg ? interpolatePoints(last, point, maxSeg) : [point]

      for (const p of fill) {
        const tail = current.points[current.points.length - 1]
        if (pointDistance(tail, p) < minDist * 0.5) continue

        current = { ...current, points: [...current.points, p] }
        currentStrokeRef.current = current
      }
    }

    if (current && currentStrokeRef.current) {
      setStrokes((prev) => {
        const next = [...prev]
        next[next.length - 1] = currentStrokeRef.current!
        return next
      })
    }
  }, [])

  const handleDrawUpdate = useCallback(
    (point: [number, number, number] | null) => {
      if (point) {
        appendPoints([point])
      } else {
        currentStrokeRef.current = null
      }
    },
    [appendPoints],
  )

  const handleClear = () => {
    setStrokes([])
    currentStrokeRef.current = null
  }

  const handleResetView = () => {
    setViewResetKey((key) => key + 1)
  }

  return (
    <div className="app">
      <Toolbar
        brushColor={brushColor}
        brushWidth={brushWidth}
        drawMode={drawMode}
        strokeCount={strokes.length}
        trackingSensitivity={trackingSensitivity}
        rotationSensitivity={rotationSensitivity}
        zoomSensitivity={zoomSensitivity}
        onColorChange={setBrushColor}
        onWidthChange={setBrushWidth}
        onModeChange={setDrawMode}
        onTrackingSensitivityChange={setTrackingSensitivity}
        onRotationSensitivityChange={setRotationSensitivity}
        onZoomSensitivityChange={setZoomSensitivity}
        onClear={handleClear}
        onResetView={handleResetView}
        canClear={strokes.length > 0}
      />

      <main className="workspace">
        <div className="scene-panel">
          <div className="scene-controls">
            <button
              type="button"
              className="scene-control-btn danger"
              onClick={handleClear}
              disabled={strokes.length === 0}
            >
              Clear
            </button>
            <button
              type="button"
              className="scene-control-btn"
              onClick={handleResetView}
            >
              Reset
            </button>
          </div>
          <SceneErrorBoundary>
            <Scene3D
              strokes={strokes}
              handStateRef={handStateRef}
              settingsRef={settingsRef}
              brushColor={brushColor}
              viewResetKey={viewResetKey}
              onDrawUpdate={handleDrawUpdate}
            />
          </SceneErrorBoundary>
        </div>

        <div className="camera-panel">
          <CameraPreview
            videoRef={videoRef}
            handState={handState}
            handStateRef={handStateRef}
            isReady={isReady}
            isStarting={isStarting}
            loadingStage={loadingStage}
            cameraActive={cameraActive}
            error={error}
            onStartCamera={startCamera}
            onCameraError={reportError}
            onCameraStart={beginCameraStart}
          />
        </div>
      </main>
    </div>
  )
}
