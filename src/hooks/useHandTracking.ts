import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  FaceLandmarkerResult,
  HandLandmarkerResult,
} from '@mediapipe/tasks-vision'
import {
  DEFAULT_ROTATION_SENSITIVITY,
  DEFAULT_TRACKING_SENSITIVITY,
  DEFAULT_ZOOM_SENSITIVITY,
} from '../config/tracking'
import type { DrawMode, HandState, TrackingSettings } from '../types/hand'
import {
  acquireCameraStream,
  attachStreamToVideo,
  formatCameraError,
  getVideoElement,
} from '../utils/cameraSupport'
import { DrawTipFilter } from '../utils/drawSmoothing'
import { getFaceOrientation } from '../utils/faceOrientation'
import {
  assignHandRoles,
  getZoomSpreadFromFocals,
  updatePinchStates,
} from '../utils/handMapping'
import {
  createVisionLandmarkers,
  formatVisionError,
  preloadVisionWasm,
} from '../utils/mediapipeSetup'
import { OneEuroFilter, OneEuroFilter3D } from '../utils/oneEuroFilter'

const INITIAL_STATE: HandState = {
  hands: [],
  handCount: 0,
  twoHandMode: false,
  isPinching: false,
  isDrawing: false,
  isNavigating: false,
  isZooming: false,
  isPaused: false,
  faceDetected: false,
  drawLandmark: null,
  drawWorldLandmark: null,
  drawWristWorldLandmark: null,
  navLandmark: null,
  zoomFocalPoints: null,
  handsSpread: null,
  navOrientation: null,
}

function toLandmarks(hand: { x: number; y: number; z: number }[]) {
  return hand.map((lm) => ({ x: lm.x, y: lm.y, z: lm.z }))
}

export function useHandTracking(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  drawMode: DrawMode,
  settings: TrackingSettings = {
    trackingSensitivity: DEFAULT_TRACKING_SENSITIVITY,
    rotationSensitivity: DEFAULT_ROTATION_SENSITIVITY,
    zoomSensitivity: DEFAULT_ZOOM_SENSITIVITY,
  },
) {
  const [handState, setHandState] = useState<HandState>(INITIAL_STATE)
  const handStateRef = useRef<HandState>(INITIAL_STATE)
  const [isReady, setIsReady] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [loadingStage, setLoadingStage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cameraActive, setCameraActive] = useState(false)
  const handLandmarkerRef = useRef<Awaited<
    ReturnType<typeof createVisionLandmarkers>
  >['handLandmarker'] | null>(null)
  const faceLandmarkerRef = useRef<Awaited<
    ReturnType<typeof createVisionLandmarkers>
  >['faceLandmarker'] | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const frameRef = useRef<number>(0)
  const lastDetectRef = useRef(0)
  const detectTimestampRef = useRef(0)
  const DETECT_INTERVAL_MS = 22
  const pinchActiveRef = useRef<boolean[]>([])
  const drawTipFilterRef = useRef(new DrawTipFilter())
  const handsSpreadFilterRef = useRef(new OneEuroFilter())
  const zoomFocalFilter0Ref = useRef(new OneEuroFilter3D())
  const zoomFocalFilter1Ref = useRef(new OneEuroFilter3D())
  const faceYawFilterRef = useRef(new OneEuroFilter())
  const facePitchFilterRef = useRef(new OneEuroFilter())
  const faceRollFilterRef = useRef(new OneEuroFilter())
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const applyFaceNavigation = useCallback(
    (state: HandState, faceResults: FaceLandmarkerResult, timestamp: number): HandState => {
      const faceSmooth = Math.max(7, settingsRef.current.rotationSensitivity + 4)
      faceYawFilterRef.current.setSmoothness(faceSmooth)
      facePitchFilterRef.current.setSmoothness(faceSmooth)
      faceRollFilterRef.current.setSmoothness(faceSmooth)

      const rawLandmarks = faceResults.faceLandmarks?.[0]
        ? toLandmarks(faceResults.faceLandmarks[0])
        : undefined
      const rawMatrix = faceResults.facialTransformationMatrixes?.[0]
      const orientation = getFaceOrientation(rawLandmarks, rawMatrix)

      if (!orientation || state.isPaused || state.isZooming) {
        faceYawFilterRef.current.reset()
        facePitchFilterRef.current.reset()
        faceRollFilterRef.current.reset()
        return {
          ...state,
          faceDetected: Boolean(rawLandmarks?.length),
          isNavigating: false,
          navOrientation: null,
        }
      }

      return {
        ...state,
        faceDetected: true,
        isNavigating: true,
        navOrientation: {
          yaw: faceYawFilterRef.current.filter(orientation.yaw, timestamp),
          pitch: facePitchFilterRef.current.filter(orientation.pitch, timestamp),
          roll: faceRollFilterRef.current.filter(orientation.roll, timestamp),
        },
      }
    },
    [],
  )

  const processHandResults = useCallback(
    (results: HandLandmarkerResult, timestamp: number): HandState => {
      if (!results.landmarks?.length) {
        pinchActiveRef.current = []
        drawTipFilterRef.current.reset()
        handsSpreadFilterRef.current.reset()
        zoomFocalFilter0Ref.current.reset()
        zoomFocalFilter1Ref.current.reset()
        return { ...INITIAL_STATE }
      }

      const sensitivity = settingsRef.current.trackingSensitivity
      drawTipFilterRef.current.setDrawSmoothness(sensitivity)
      handsSpreadFilterRef.current.setSmoothness(
        Math.max(4, settingsRef.current.zoomSensitivity),
      )
      zoomFocalFilter0Ref.current.setSmoothness(
        Math.max(4, settingsRef.current.zoomSensitivity),
      )
      zoomFocalFilter1Ref.current.setSmoothness(
        Math.max(4, settingsRef.current.zoomSensitivity),
      )

      const rawLandmarks = results.landmarks.map(toLandmarks)
      const rawWorld = results.landmarks.map((hand, i) =>
        toLandmarks(results.worldLandmarks?.[i] ?? hand),
      )

      const pinchActive = updatePinchStates(
        rawLandmarks,
        pinchActiveRef.current,
        sensitivity,
      )
      pinchActiveRef.current = pinchActive

      let state = assignHandRoles(rawLandmarks, rawWorld, drawMode, pinchActive)

      if (state.drawLandmark && state.drawWorldLandmark) {
        const screenTip = drawTipFilterRef.current.filterScreen(
          state.drawLandmark,
          timestamp,
        )
        const worldTip = drawTipFilterRef.current.filterWorld(
          state.drawWorldLandmark,
          timestamp,
        )
        const wristWorld = state.drawWristWorldLandmark
          ? drawTipFilterRef.current.filterWrist(
              state.drawWristWorldLandmark,
              timestamp,
            )
          : null
        state = {
          ...state,
          drawLandmark: screenTip,
          drawWorldLandmark: worldTip,
          drawWristWorldLandmark: wristWorld,
        }
      } else {
        drawTipFilterRef.current.reset()
      }

      if (state.zoomFocalPoints) {
        const [f0, f1] = state.zoomFocalPoints
        const [x0, y0, z0] = zoomFocalFilter0Ref.current.filter(
          f0.x,
          f0.y,
          f0.z,
          timestamp,
        )
        const [x1, y1, z1] = zoomFocalFilter1Ref.current.filter(
          f1.x,
          f1.y,
          f1.z,
          timestamp,
        )
        const fp0 = { x: x0, y: y0, z: z0 }
        const fp1 = { x: x1, y: y1, z: z1 }
        const spread = getZoomSpreadFromFocals(fp0, fp1)
        state = {
          ...state,
          zoomFocalPoints: [fp0, fp1],
          handsSpread: handsSpreadFilterRef.current.filter(spread, timestamp),
        }
      } else {
        handsSpreadFilterRef.current.reset()
        zoomFocalFilter0Ref.current.reset()
        zoomFocalFilter1Ref.current.reset()
      }

      return state
    },
    [drawMode],
  )

  const processFrame = useCallback(
    (
      handResults: HandLandmarkerResult,
      faceResults: FaceLandmarkerResult | null,
    ) => {
      const timestamp = performance.now()
      const handStateOnly = processHandResults(handResults, timestamp)
      const next = faceResults
        ? applyFaceNavigation(handStateOnly, faceResults, timestamp)
        : handStateOnly
      handStateRef.current = next
      setHandState(next)
    },
    [applyFaceNavigation, processHandResults],
  )

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(frameRef.current)
    handLandmarkerRef.current?.close()
    faceLandmarkerRef.current?.close()
    streamRef.current?.getTracks().forEach((t) => t.stop())
    handLandmarkerRef.current = null
    faceLandmarkerRef.current = null
    streamRef.current = null
    pinchActiveRef.current = []
    handStateRef.current = INITIAL_STATE
    setHandState(INITIAL_STATE)
    setIsReady(false)
    setCameraActive(false)
  }, [])

  const reportError = useCallback((message: string) => {
    setError(message)
    setLoadingStage(null)
    setIsStarting(false)
  }, [])

  useEffect(() => {
    preloadVisionWasm().catch(() => {})
  }, [])

  /**
   * Pass `stream` from the button click handler (after acquireCameraStream there)
   * so Edge keeps user activation — do not await anything before getUserMedia.
   */
  const startCamera = useCallback(
    async (streamFromGesture?: MediaStream) => {
      if (isStarting || cameraActive) return
      setIsStarting(true)
      setError(null)
      setLoadingStage('Opening camera…')

      try {
        const stream = streamFromGesture ?? (await acquireCameraStream())
        const video = getVideoElement(() => videoRef.current)
        await attachStreamToVideo(video, stream)
        streamRef.current = stream
        setCameraActive(true)

        setLoadingStage('Loading hand & face models…')
        const { handLandmarker, faceLandmarker } = await createVisionLandmarkers()
        handLandmarkerRef.current = handLandmarker
        faceLandmarkerRef.current = faceLandmarker

        detectTimestampRef.current = 0
        lastDetectRef.current = 0
        let detectFailures = 0

        function detect() {
          const handLm = handLandmarkerRef.current
          const vid = videoRef.current
          if (!handLm || !vid) {
            return
          }

          const now = performance.now()
          if (vid.readyState >= 2 && now - lastDetectRef.current >= DETECT_INTERVAL_MS) {
            lastDetectRef.current = now
            const ts = Math.max(detectTimestampRef.current + 1, Math.round(now))
            detectTimestampRef.current = ts
            try {
              const handResults = handLm.detectForVideo(vid, ts)
              const faceLm = faceLandmarkerRef.current
              const faceResults = faceLm
                ? faceLm.detectForVideo(vid, ts)
                : null
              processFrame(handResults, faceResults)
              detectFailures = 0
            } catch (detectErr) {
              detectFailures += 1
              if (detectFailures >= 45) {
                cancelAnimationFrame(frameRef.current)
                stopCamera()
                setError(formatVisionError(detectErr))
                setLoadingStage(null)
                setIsStarting(false)
                return
              }
            }
          }

          frameRef.current = requestAnimationFrame(detect)
        }

        detect()
        setIsReady(true)
        setError(null)
        setLoadingStage(null)
      } catch (err) {
        stopCamera()
        const msg =
          err instanceof Error && /hand|face|model|wasm|mediapipe/i.test(err.message)
            ? formatVisionError(err)
            : formatCameraError(err)
        setError(msg)
        setLoadingStage(null)
      } finally {
        setIsStarting(false)
      }
    },
    [cameraActive, isStarting, processFrame, stopCamera, videoRef],
  )

  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [stopCamera])

  return {
    handState,
    handStateRef,
    isReady,
    isStarting,
    loadingStage,
    error,
    cameraActive,
    startCamera,
    stopCamera,
    reportError,
  }
}
