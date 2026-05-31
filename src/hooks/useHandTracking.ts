import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FaceLandmarker,
  FilesetResolver,
  HandLandmarker,
  type FaceLandmarkerResult,
  type HandLandmarkerResult,
} from '@mediapipe/tasks-vision'
import {
  DEFAULT_ROTATION_SENSITIVITY,
  DEFAULT_TRACKING_SENSITIVITY,
  DEFAULT_ZOOM_SENSITIVITY,
} from '../config/tracking'
import type { DrawMode, HandState, TrackingSettings } from '../types/hand'
import { DrawTipFilter } from '../utils/drawSmoothing'
import { getFaceOrientation } from '../utils/faceOrientation'
import { assignHandRoles, getZoomSpreadFromFocals, updatePinchStates } from '../utils/handMapping'
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

const WASM_PATH =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
const HAND_MODEL_PATH =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task'
const FACE_MODEL_PATH =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task'

function toLandmarks(hand: { x: number; y: number; z: number }[]) {
  return hand.map((lm) => ({ x: lm.x, y: lm.y, z: lm.z }))
}

export function useHandTracking(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  drawMode: DrawMode,
  enabled: boolean,
  settings: TrackingSettings = {
    trackingSensitivity: DEFAULT_TRACKING_SENSITIVITY,
    rotationSensitivity: DEFAULT_ROTATION_SENSITIVITY,
    zoomSensitivity: DEFAULT_ZOOM_SENSITIVITY,
  },
) {
  const [handState, setHandState] = useState<HandState>(INITIAL_STATE)
  const handStateRef = useRef<HandState>(INITIAL_STATE)
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const handLandmarkerRef = useRef<HandLandmarker | null>(null)
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const frameRef = useRef<number>(0)
  const lastDetectRef = useRef(0)
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
    (handResults: HandLandmarkerResult, faceResults: FaceLandmarkerResult) => {
      const timestamp = performance.now()
      const handStateOnly = processHandResults(handResults, timestamp)
      const next = applyFaceNavigation(handStateOnly, faceResults, timestamp)
      handStateRef.current = next
      setHandState(next)
    },
    [applyFaceNavigation, processHandResults],
  )

  useEffect(() => {
    if (!enabled) return

    let cancelled = false

    async function start() {
      try {
        const video = videoRef.current
        if (!video) return

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 960 },
            height: { ideal: 540 },
            frameRate: { ideal: 60, max: 60 },
            facingMode: 'user',
          },
          audio: false,
        })

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }

        streamRef.current = stream
        video.srcObject = stream
        await video.play()

        const vision = await FilesetResolver.forVisionTasks(WASM_PATH)
        const [handLandmarker, faceLandmarker] = await Promise.all([
          HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: HAND_MODEL_PATH,
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numHands: 2,
          }),
          FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: FACE_MODEL_PATH,
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numFaces: 1,
            outputFacialTransformationMatrixes: true,
          }),
        ])

        if (cancelled) {
          handLandmarker.close()
          faceLandmarker.close()
          stream.getTracks().forEach((t) => t.stop())
          return
        }

        handLandmarkerRef.current = handLandmarker
        faceLandmarkerRef.current = faceLandmarker

        function detect() {
          if (
            cancelled ||
            !handLandmarkerRef.current ||
            !faceLandmarkerRef.current ||
            !videoRef.current
          ) {
            return
          }

          const vid = videoRef.current
          const now = performance.now()
          if (vid.readyState >= 2 && now - lastDetectRef.current >= DETECT_INTERVAL_MS) {
            lastDetectRef.current = now
            const handResults = handLandmarkerRef.current.detectForVideo(vid, now)
            const faceResults = faceLandmarkerRef.current.detectForVideo(vid, now)
            processFrame(handResults, faceResults)
          }

          frameRef.current = requestAnimationFrame(detect)
        }

        detect()
        setIsReady(true)
        setError(null)
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Camera access failed. Allow webcam permissions.',
          )
        }
      }
    }

    start()

    return () => {
      cancelled = true
      cancelAnimationFrame(frameRef.current)
      handLandmarkerRef.current?.close()
      faceLandmarkerRef.current?.close()
      streamRef.current?.getTracks().forEach((t) => t.stop())
      handLandmarkerRef.current = null
      faceLandmarkerRef.current = null
      streamRef.current = null
      pinchActiveRef.current = []
      setIsReady(false)
    }
  }, [enabled, processFrame, videoRef])

  return { handState, handStateRef, isReady, error }
}
