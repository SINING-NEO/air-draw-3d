import * as THREE from 'three'
import {
  pinchEnterThreshold,
  pinchExitThreshold,
  trackingMultiplier,
} from '../config/tracking'
import type { HandLandmark, HandState } from '../types/hand'

const BASE_DISTANCE = 7
const DEPTH_SCALE = 14
const MIN_DISTANCE = 2.5
const MAX_DISTANCE = 15

const ndc = new THREE.Vector2()
const raycaster = new THREE.Raycaster()
const worldPoint = new THREE.Vector3()

function blendLandmarks(a: HandLandmark, b: HandLandmark, t = 0.5): HandLandmark {
  const s = 1 - t
  return {
    x: a.x * s + b.x * t,
    y: a.y * s + b.y * t,
    z: a.z * s + b.z * t,
  }
}

/** Map fingertip to 3D — view-aligned XY, depth scales with current camera zoom. */
export function landmarkToWorldFromCamera(
  landmark: HandLandmark,
  camera: THREE.Camera,
  worldLandmark?: HandLandmark | null,
  wristWorld?: HandLandmark | null,
  sensitivity = 7,
  viewDistance = BASE_DISTANCE,
): [number, number, number] {
  const depthGain = trackingMultiplier(sensitivity)

  ndc.x = (1 - landmark.x) * 2 - 1
  ndc.y = -(landmark.y * 2 - 1)

  raycaster.setFromCamera(ndc, camera)

  const depthSource = worldLandmark ?? landmark
  const handDepth =
    wristWorld != null
      ? wristWorld.z * 0.6 + depthSource.z * 0.4
      : depthSource.z

  const absoluteDepth = BASE_DISTANCE - handDepth * DEPTH_SCALE * depthGain
  const safeViewDistance = Number.isFinite(viewDistance) && viewDistance > 0
    ? viewDistance
    : BASE_DISTANCE
  const depthFraction = THREE.MathUtils.clamp(
    absoluteDepth / BASE_DISTANCE,
    MIN_DISTANCE / safeViewDistance,
    MAX_DISTANCE / safeViewDistance,
  )
  const distance = safeViewDistance * depthFraction

  if (!Number.isFinite(distance)) {
    return [0, 0, -safeViewDistance * 0.75]
  }

  worldPoint.copy(raycaster.ray.origin)
  worldPoint.addScaledVector(raycaster.ray.direction, distance)

  return [worldPoint.x, worldPoint.y, worldPoint.z]
}

export function pinchDistance(landmarks: HandLandmark[]): number {
  const a = landmarks[4]
  const b = landmarks[8]
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

/** Hysteresis pinch — stops draw mode flickering at the threshold. */
export function updatePinchStates(
  allLandmarks: HandLandmark[][],
  prevActive: boolean[],
  sensitivity: number,
): boolean[] {
  const enter = pinchEnterThreshold(sensitivity)
  const exit = pinchExitThreshold(sensitivity)

  return allLandmarks.map((landmarks, i) => {
    const dist = pinchDistance(landmarks)
    const wasActive = prevActive[i] ?? false

    if (wasActive) {
      return dist < exit
    }
    return dist < enter
  })
}

function isFingerExtended(
  landmarks: HandLandmark[],
  tip: number,
  pip: number,
  mcp: number,
): boolean {
  return (
    landmarks[tip].y < landmarks[pip].y &&
    landmarks[pip].y < landmarks[mcp].y
  )
}

export function isOpenPalm(landmarks: HandLandmark[], pinching: boolean): boolean {
  if (pinching) return false

  return (
    isFingerExtended(landmarks, 8, 6, 5) &&
    isFingerExtended(landmarks, 12, 10, 9) &&
    isFingerExtended(landmarks, 16, 14, 13) &&
    isFingerExtended(landmarks, 20, 18, 17)
  )
}

function isFingerFolded(landmarks: HandLandmark[], tip: number, pip: number): boolean {
  return landmarks[tip].y >= landmarks[pip].y - 0.015
}

/** Peace sign — no longer used for look-around (kept for draw/zoom exclusion). */
function isPeaceSign(landmarks: HandLandmark[], pinching: boolean): boolean {
  if (pinching) return false
  if (isOpenPalm(landmarks, pinching)) return false

  return (
    isFingerExtended(landmarks, 8, 6, 5) &&
    isFingerExtended(landmarks, 12, 10, 9) &&
    isFingerFolded(landmarks, 16, 14) &&
    isFingerFolded(landmarks, 20, 18)
  )
}

function getEligibleZoomData(
  allLandmarks: HandLandmark[][],
  drawIdx: number,
  peaceMask: boolean[],
) {
  if (allLandmarks.length !== 2) return null

  for (let i = 0; i < 2; i++) {
    if (peaceMask[i] || i === drawIdx) return null
  }

  const focalPoints: [HandLandmark, HandLandmark] = [
    getZoomFocalPoint(allLandmarks[0]),
    getZoomFocalPoint(allLandmarks[1]),
  ]
  return {
    spread: getZoomSpreadFromFocals(focalPoints[0], focalPoints[1]),
    focalPoints,
  }
}

export function getPalmCenter(landmarks: HandLandmark[]): HandLandmark {
  const ids = [0, 5, 9, 13, 17]
  let x = 0
  let y = 0
  let z = 0
  for (const id of ids) {
    x += landmarks[id].x
    y += landmarks[id].y
    z += landmarks[id].z
  }
  const n = ids.length
  return { x: x / n, y: y / n, z: z / n }
}

export function getZoomFocalPoint(landmarks: HandLandmark[]): HandLandmark {
  return getPalmCenter(landmarks)
}

/** Screen-space distance between two hand focal points (0–1 coords). */
export function getZoomSpreadFromFocals(a: HandLandmark, b: HandLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function getZoomFocals(
  allLandmarks: HandLandmark[][],
): { spread: number; focalPoints: [HandLandmark, HandLandmark] } | null {
  if (allLandmarks.length < 2) return null
  const focalPoints: [HandLandmark, HandLandmark] = [
    getZoomFocalPoint(allLandmarks[0]),
    getZoomFocalPoint(allLandmarks[1]),
  ]
  return {
    spread: getZoomSpreadFromFocals(focalPoints[0], focalPoints[1]),
    focalPoints,
  }
}

export function isIndexExtended(landmarks: HandLandmark[]): boolean {
  const tip = landmarks[8]
  const pip = landmarks[6]
  const mcp = landmarks[5]
  const middleTip = landmarks[12]

  const indexExtended = tip.y < pip.y && pip.y < mcp.y
  const middleFolded = middleTip.y > landmarks[10].y

  return indexExtended && middleFolded
}

export function getDrawLandmark(landmarks: HandLandmark[]): HandLandmark {
  return landmarks[8]
}

export function getDrawScreenLandmark(
  landmarks: HandLandmark[],
  mode: 'pinch' | 'point',
  pinching: boolean,
): HandLandmark {
  if (mode === 'pinch' && pinching) {
    return blendLandmarks(landmarks[4], landmarks[8])
  }
  return landmarks[8]
}

export function getDrawWorldLandmark(
  worldLandmarks: HandLandmark[],
  mode: 'pinch' | 'point',
  pinching: boolean,
): HandLandmark {
  if (mode === 'pinch' && pinching) {
    return blendLandmarks(worldLandmarks[4], worldLandmarks[8])
  }
  return worldLandmarks[8]
}

export function shouldDraw(
  landmarks: HandLandmark[],
  mode: 'pinch' | 'point',
  pinchActive: boolean,
): boolean {
  return mode === 'pinch' ? pinchActive : isIndexExtended(landmarks)
}

export function pointDistance(
  a: [number, number, number],
  b: [number, number, number],
): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

function buildHandState(
  hands: HandState['hands'],
  drawIdx: number,
  zoomSpread: number | null,
  zoomFocalPoints: [HandLandmark, HandLandmark] | null,
  allLandmarks: HandLandmark[][],
  allWorld: HandLandmark[][],
  pinchActive: boolean[],
  drawMode: 'pinch' | 'point',
  isPaused: boolean,
): HandState {
  const isZooming = zoomSpread != null

  return {
    hands,
    handCount: allLandmarks.length,
    twoHandMode: isZooming,
    isPinching: pinchActive.some(Boolean),
    isDrawing: drawIdx >= 0,
    isNavigating: false,
    isZooming,
    isPaused,
    faceDetected: false,
    drawLandmark:
      drawIdx >= 0
        ? getDrawScreenLandmark(
            allLandmarks[drawIdx],
            drawMode,
            pinchActive[drawIdx] ?? false,
          )
        : null,
    drawWorldLandmark:
      drawIdx >= 0 && allWorld[drawIdx]
        ? getDrawWorldLandmark(
            allWorld[drawIdx],
            drawMode,
            pinchActive[drawIdx] ?? false,
          )
        : null,
    drawWristWorldLandmark:
      drawIdx >= 0 && allWorld[drawIdx]?.[0] ? allWorld[drawIdx][0] : null,
    navLandmark: null,
    zoomFocalPoints,
    handsSpread: zoomSpread,
    navOrientation: null,
  }
}

function roleForHand(
  i: number,
  drawIdx: number,
  isZooming: boolean,
  pauseMask: boolean[],
  handCount: number,
): HandState['hands'][number]['role'] {
  if (pauseMask[i]) return 'open'
  if (i === drawIdx) return 'draw'
  if (isZooming && handCount === 2) return 'zoom'
  return 'idle'
}

export function assignHandRoles(
  allLandmarks: HandLandmark[][],
  allWorldLandmarks: HandLandmark[][],
  drawMode: 'pinch' | 'point',
  pinchActive: boolean[],
): HandState {
  const empty: HandState = {
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

  if (allLandmarks.length === 0) return empty

  const isSingleHand = allLandmarks.length === 1
  const openHandMask = allLandmarks.map((lm, i) =>
    isOpenPalm(lm, pinchActive[i] ?? false),
  )
  const peaceMask = allLandmarks.map((lm, i) =>
    isPeaceSign(lm, pinchActive[i] ?? false),
  )

  const drawIdx = allLandmarks.findIndex(
    (lm, i) =>
      !peaceMask[i] &&
      shouldDraw(lm, drawMode, pinchActive[i] ?? false),
  )

  // Pause: one open palm alone, or open palm on one hand while the other draws
  const pauseMask = openHandMask.map((open, i) => {
    if (isSingleHand && open) return true
    if (drawIdx >= 0 && open && i !== drawIdx) return true
    return false
  })
  const isPaused = pauseMask.some(Boolean)

  const zoomData = getEligibleZoomData(allLandmarks, drawIdx, peaceMask)
  const zoomSpread = zoomData?.spread ?? null
  const zoomFocalPoints = zoomData?.focalPoints ?? null
  const isZooming = zoomSpread != null

  const hands: HandState['hands'] = allLandmarks.map((landmarks, i) => ({
    landmarks,
    worldLandmarks: allWorldLandmarks[i] ?? landmarks,
    role: roleForHand(i, drawIdx, isZooming, pauseMask, allLandmarks.length),
  }))

  return buildHandState(
    hands,
    drawIdx,
    zoomSpread,
    zoomFocalPoints,
    allLandmarks,
    allWorldLandmarks,
    pinchActive,
    drawMode,
    isPaused,
  )
}
