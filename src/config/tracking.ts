/** Stable, consistent tracking — sensitivity adjusts response without wild swings. */
export const DEFAULT_TRACKING_SENSITIVITY = 7
export const DEFAULT_ROTATION_SENSITIVITY = 3
export const DEFAULT_ZOOM_SENSITIVITY = 7

/** Position / depth response (clamped for stability). */
export function trackingMultiplier(level: number): number {
  return Math.min(2.1, 0.9 + level * 0.12)
}

export function rotationMultiplier(level: number): number {
  return Math.min(1.25, 0.28 + level * 0.07)
}

/** Palm drag → view yaw/pitch (lower = gentler). */
export function palmNavRotationGain(level: number): number {
  return Math.min(4.2, 1.8 + level * 0.35)
}

/** Wrist tilt → view yaw/pitch (lower = gentler). */
export function orientationRotationGain(level: number): number {
  return Math.min(1.0, 0.35 + level * 0.08)
}

/** Wrist roll → scene tilt (lower = gentler). */
export function rollRotationGain(level: number): number {
  return Math.min(0.85, 0.3 + level * 0.06)
}

/** Hand push/pull zoom strength. */
export function zoomMultiplier(level: number): number {
  return 0.9 + level * 0.35
}

/** Smooth zoom catch-up per frame (lower = silkier). */
export function zoomLerpFactor(level: number): number {
  return Math.max(0.045, 0.14 - level * 0.009)
}

/** Smooth rotation catch-up per frame (lower = silkier). */
export function rotationLerpFactor(level: number): number {
  return Math.max(0.028, 0.075 - level * 0.005)
}

/** Scene roll smoothing when tilting the wrist. */
export function rollLerpFactor(level: number): number {
  return Math.max(0.035, 0.09 - level * 0.006)
}

/** Pinch on/off with hysteresis so draw mode doesn't flicker. */
export function pinchEnterThreshold(level: number): number {
  return 0.072 - level * 0.002
}

export function pinchExitThreshold(level: number): number {
  return pinchEnterThreshold(level) + 0.022
}

/** Minimum gap between stored stroke points. */
export function minPointDistance(level: number): number {
  return Math.max(0.01, 0.038 - level * 0.003)
}

/** Max gap — insert interpolated points above this for smooth curves. */
export function maxSegmentLength(level: number): number {
  return 0.07 + level * 0.01
}

/** Frame lerp toward fingertip target (higher = snappier). */
export function drawLerpFactor(level: number): number {
  return Math.max(0.35, 0.62 - level * 0.025)
}

/** Adaptive catch-up boost when the hand moves quickly. */
export function drawCatchupBoost(level: number): number {
  return 2.4 + level * 0.35
}
