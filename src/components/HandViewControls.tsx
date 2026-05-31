import { useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import {
  rollLerpFactor,
  rotationLerpFactor,
  rotationMultiplier,
  trackingMultiplier,
  zoomLerpFactor,
  zoomMultiplier,
} from '../config/tracking'
import type {
  HandLandmark,
  HandOrientation,
  HandState,
  TrackingSettings,
  ViewDrawContext,
} from '../types/hand'
import { DEFAULT_VIEW_DRAW_CONTEXT } from '../types/hand'
import { orientationDelta } from '../utils/handOrientation'
import { OneEuroFilter } from '../utils/oneEuroFilter'

const cameraOffset = new THREE.Vector3()

function setCameraDistance(controls: OrbitControlsImpl, distance: number) {
  if (!Number.isFinite(distance)) return

  const clamped = THREE.MathUtils.clamp(
    distance,
    controls.minDistance,
    controls.maxDistance,
  )
  cameraOffset.subVectors(controls.object.position, controls.target)
  if (cameraOffset.lengthSq() < 1e-8) {
    cameraOffset.set(0, 0, 1)
  } else {
    cameraOffset.normalize()
  }
  controls.object.position.copy(controls.target).addScaledVector(cameraOffset, clamped)
}

interface HandViewControlsProps {
  handStateRef: React.RefObject<HandState>
  settingsRef: React.RefObject<TrackingSettings>
  sceneRollRef: React.MutableRefObject<number>
  viewResetKey: number
  viewDrawContextRef: React.MutableRefObject<ViewDrawContext>
}

const DEFAULT_CAMERA_POSITION = new THREE.Vector3(0, 1.5, 8)
const DEFAULT_TARGET = new THREE.Vector3(0, 0, 0)
const DEFAULT_DISTANCE = DEFAULT_CAMERA_POSITION.distanceTo(DEFAULT_TARGET)

export function HandViewControls({
  handStateRef,
  settingsRef,
  sceneRollRef,
  viewResetKey,
  viewDrawContextRef,
}: HandViewControlsProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null)

  const prevNavRef = useRef<HandLandmark | null>(null)
  const prevOrientRef = useRef<HandOrientation | null>(null)
  const wasZoomingRef = useRef(false)

  const zoomStartSpanRef = useRef<number | null>(null)
  const zoomStartDistRef = useRef<number | null>(null)

  const targetAzimuthRef = useRef(0)
  const targetPolarRef = useRef(Math.PI / 2.5)
  const targetRollRef = useRef(0)
  const targetDistRef = useRef(DEFAULT_DISTANCE)
  const smoothAzimuthRef = useRef(0)
  const smoothPolarRef = useRef(Math.PI / 2.5)
  const smoothRollRef = useRef(0)
  const smoothDistRef = useRef(DEFAULT_DISTANCE)
  const viewSyncedRef = useRef(false)

  const dxFilterRef = useRef(new OneEuroFilter(1.2, 0.008))
  const dyFilterRef = useRef(new OneEuroFilter(1.2, 0.008))
  const yawFilterRef = useRef(new OneEuroFilter(1.0, 0.007))
  const pitchFilterRef = useRef(new OneEuroFilter(1.0, 0.007))
  const rollFilterRef = useRef(new OneEuroFilter(1.0, 0.007))

  function resetView() {
    const controls = controlsRef.current
    if (!controls) return

    controls.target.copy(DEFAULT_TARGET)
    controls.object.position.copy(DEFAULT_CAMERA_POSITION)
    controls.update()

    sceneRollRef.current = 0
    prevNavRef.current = null
    prevOrientRef.current = null
    wasZoomingRef.current = false
    zoomStartSpanRef.current = null
    zoomStartDistRef.current = null
    viewSyncedRef.current = false
    syncViewFromControls(controls)
    viewDrawContextRef.current = {
      distance: controls.getDistance(),
      isChanging: false,
    }
  }

  useEffect(() => {
    if (viewResetKey > 0) resetView()
  }, [viewResetKey])

  function syncViewFromControls(controls: OrbitControlsImpl) {
    const az = controls.getAzimuthalAngle()
    const pol = controls.getPolarAngle()
    const dist = controls.getDistance()
    if (!Number.isFinite(az) || !Number.isFinite(pol) || !Number.isFinite(dist)) {
      return
    }

    targetAzimuthRef.current = az
    targetPolarRef.current = pol
    targetDistRef.current = dist
    smoothAzimuthRef.current = az
    smoothPolarRef.current = pol
    smoothDistRef.current = dist
    targetRollRef.current = sceneRollRef.current
    smoothRollRef.current = sceneRollRef.current
    viewSyncedRef.current = true
  }

  function setFilterSmoothness(level: number) {
    const smoothLevel = Math.max(1, 11 - level)
    dxFilterRef.current.setSmoothness(smoothLevel)
    dyFilterRef.current.setSmoothness(smoothLevel)
    yawFilterRef.current.setSmoothness(smoothLevel)
    pitchFilterRef.current.setSmoothness(smoothLevel)
    rollFilterRef.current.setSmoothness(smoothLevel)
  }

  useFrame((_state, delta) => {
    const controls = controlsRef.current
    const handState = handStateRef.current
    const settings = settingsRef.current
    if (!controls || !handState || !settings) return

    try {
      if (!viewSyncedRef.current) syncViewFromControls(controls)

      const {
        isNavigating,
        isZooming,
        isDrawing,
        navLandmark,
        handsSpread,
        navOrientation,
      } = handState
      const trackGain = trackingMultiplier(settings.trackingSensitivity)
      const rotGain = rotationMultiplier(settings.rotationSensitivity)
      const zoomGain = zoomMultiplier(settings.zoomSensitivity)
      const zoomLerp = zoomLerpFactor(settings.zoomSensitivity)
      const rotLerp = rotationLerpFactor(settings.rotationSensitivity)
      const rollLerp = rollLerpFactor(settings.rotationSensitivity)
      const now = performance.now()
      const dtScale = Math.min(delta * 60, 2)

      setFilterSmoothness(settings.rotationSensitivity)

      const handDrivingView = isNavigating || isZooming

      if (isNavigating && !isZooming && navLandmark && !prevNavRef.current) {
        syncViewFromControls(controls)
        prevOrientRef.current = navOrientation ? { ...navOrientation } : null
      }

      if (isNavigating && !isZooming && navLandmark) {
        const prevPos = prevNavRef.current
        if (prevPos) {
          const dx = dxFilterRef.current.filter(
            (1 - navLandmark.x) - (1 - prevPos.x),
            now,
          )
          const dy = dyFilterRef.current.filter(navLandmark.y - prevPos.y, now)

          if (Math.abs(dx) > 0.00005) {
            targetAzimuthRef.current -= dx * 7.5 * trackGain
          }
          if (Math.abs(dy) > 0.00005) {
            targetPolarRef.current -= dy * 7.5 * trackGain
            targetPolarRef.current = THREE.MathUtils.clamp(
              targetPolarRef.current,
              controls.minPolarAngle,
              controls.maxPolarAngle,
            )
          }
        }

        prevNavRef.current = { ...navLandmark }

        if (navOrientation && prevOrientRef.current) {
          const { yaw, pitch, roll } = orientationDelta(
            prevOrientRef.current,
            navOrientation,
          )

          if (Math.abs(yaw) > 0.0008) {
            targetAzimuthRef.current -=
              yawFilterRef.current.filter(yaw, now) * 2 * rotGain
          }
          if (Math.abs(pitch) > 0.0008) {
            targetPolarRef.current -=
              pitchFilterRef.current.filter(pitch, now) * 2 * rotGain
            targetPolarRef.current = THREE.MathUtils.clamp(
              targetPolarRef.current,
              controls.minPolarAngle,
              controls.maxPolarAngle,
            )
          }
          if (Math.abs(roll) > 0.0008) {
            targetRollRef.current +=
              rollFilterRef.current.filter(roll, now) * 1.6 * rotGain
          }

          prevOrientRef.current = { ...navOrientation }
        }
      } else if (!isNavigating) {
        prevNavRef.current = null
        if (!isZooming) prevOrientRef.current = null
      }

      if (isZooming && !isNavigating && handsSpread != null && handsSpread > 0) {
        if (!wasZoomingRef.current) {
          syncViewFromControls(controls)
          zoomStartSpanRef.current = handsSpread
          zoomStartDistRef.current = controls.getDistance()
          targetDistRef.current = controls.getDistance()
          smoothDistRef.current = controls.getDistance()
        }

        if (zoomStartSpanRef.current && zoomStartDistRef.current != null) {
          const ratio = Math.max(0.25, handsSpread / zoomStartSpanRef.current)
          targetDistRef.current = THREE.MathUtils.clamp(
            zoomStartDistRef.current / Math.pow(ratio, zoomGain),
            controls.minDistance,
            controls.maxDistance,
          )
        }
      } else if (wasZoomingRef.current) {
        zoomStartSpanRef.current = null
        zoomStartDistRef.current = null
      }

      wasZoomingRef.current = isZooming

      if (handDrivingView) {
        const zLerp = 1 - Math.pow(1 - zoomLerp, dtScale)
        const rLerp = 1 - Math.pow(1 - rotLerp, dtScale)
        const rlLerp = 1 - Math.pow(1 - rollLerp, dtScale)

        smoothAzimuthRef.current = THREE.MathUtils.lerp(
          smoothAzimuthRef.current,
          targetAzimuthRef.current,
          rLerp,
        )
        smoothPolarRef.current = THREE.MathUtils.lerp(
          smoothPolarRef.current,
          targetPolarRef.current,
          rLerp,
        )
        smoothRollRef.current = THREE.MathUtils.lerp(
          smoothRollRef.current,
          targetRollRef.current,
          rlLerp,
        )
        smoothDistRef.current = THREE.MathUtils.lerp(
          smoothDistRef.current,
          targetDistRef.current,
          zLerp,
        )

        controls.setAzimuthalAngle(smoothAzimuthRef.current)
        controls.setPolarAngle(smoothPolarRef.current)
        sceneRollRef.current = smoothRollRef.current
        setCameraDistance(controls, smoothDistRef.current)
        controls.update()
      } else {
        syncViewFromControls(controls)
      }

      const viewDist = controls.getDistance()
      viewDrawContextRef.current = {
        distance: Number.isFinite(viewDist)
          ? viewDist
          : DEFAULT_VIEW_DRAW_CONTEXT.distance,
        isChanging: Boolean(isDrawing && handDrivingView),
      }
    } catch (error) {
      console.error('HandViewControls update failed:', error)
    }
  })

  return (
    <OrbitControls
      ref={controlsRef}
      enableRotate
      enableZoom
      enablePan
      enableDamping
      dampingFactor={0.085}
      rotateSpeed={0.85}
      zoomSpeed={1.2}
      minDistance={3}
      maxDistance={20}
      maxPolarAngle={Math.PI / 1.5}
    />
  )
}
