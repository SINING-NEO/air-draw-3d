export interface HandLandmark {
  x: number
  y: number
  z: number
}

export interface HandOrientation {
  yaw: number
  pitch: number
  roll: number
}

export type HandRole = 'draw' | 'navigate' | 'zoom' | 'idle' | 'open'

export interface TrackedHand {
  landmarks: HandLandmark[]
  worldLandmarks: HandLandmark[]
  role: HandRole
}

export interface HandState {
  hands: TrackedHand[]
  handCount: number
  twoHandMode: boolean
  isPinching: boolean
  isDrawing: boolean
  isNavigating: boolean
  isZooming: boolean
  /** Single open palm — pause only, never with two hands. */
  isPaused: boolean
  /** Head / face detected — look-around comes from face orientation. */
  faceDetected: boolean
  drawLandmark: HandLandmark | null
  drawWorldLandmark: HandLandmark | null
  /** Wrist world landmark for stable draw depth. */
  drawWristWorldLandmark: HandLandmark | null
  navLandmark: HandLandmark | null
  /** Screen-space palm focal points when two hands are visible (for zoom). */
  zoomFocalPoints: [HandLandmark, HandLandmark] | null
  handsSpread: number | null
  navOrientation: HandOrientation | null
}

export interface Stroke {
  id: string
  color: string
  width: number
  points: [number, number, number][]
}

export type DrawMode = 'pinch' | 'point'

export interface TrackingSettings {
  trackingSensitivity: number
  rotationSensitivity: number
  zoomSensitivity: number
}

/** Live camera state shared with the draw loop (updated before each draw sample). */
export interface ViewDrawContext {
  distance: number
  isChanging: boolean
}

export const DEFAULT_VIEW_DRAW_CONTEXT: ViewDrawContext = {
  distance: 8.14,
  isChanging: false,
}
