import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import {
  orientationRotationGain,
  rollRotationGain,
  drawCatchupBoost,
  drawLerpFactor,
  zoomMultiplier,
} from '../config/tracking'
import type { HandState, Stroke, TrackingSettings } from '../types/hand'
import { DRAW_REFERENCE_DISTANCE, FirstPersonView } from '../utils/firstPersonView'
import { landmarkToWorldFromCamera } from '../utils/handMapping'
import { orientationDelta } from '../utils/handOrientation'
import { OneEuroFilter } from '../utils/oneEuroFilter'
import { createStrokeMesh } from '../utils/strokeGeometry'
import { createWebGLRenderer, disposeObject3D } from '../utils/threeCleanup'

interface Scene3DProps {
  strokes: Stroke[]
  handStateRef: React.RefObject<HandState>
  settingsRef: React.RefObject<TrackingSettings>
  brushColor: string
  viewResetKey: number
  onDrawUpdate: (point: [number, number, number] | null) => void
}

const DEFAULT_CAMERA = new THREE.Vector3(0, 1.5, 8)
const DEFAULT_LOOK_AT = new THREE.Vector3(0, 0, 0)

export function Scene3D({
  strokes,
  handStateRef,
  settingsRef,
  brushColor,
  viewResetKey,
  onDrawUpdate,
}: Scene3DProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [initError, setInitError] = useState<string | null>(null)
  const [sceneKey, setSceneKey] = useState(0)
  const strokesRef = useRef(strokes)
  const brushColorRef = useRef(brushColor)
  const onDrawUpdateRef = useRef(onDrawUpdate)
  const viewResetKeyRef = useRef(viewResetKey)

  strokesRef.current = strokes
  brushColorRef.current = brushColor
  onDrawUpdateRef.current = onDrawUpdate
  viewResetKeyRef.current = viewResetKey

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    setInitError(null)

    let scene: THREE.Scene
    let renderer: THREE.WebGLRenderer
    let frameId = 0

    try {
    scene = new THREE.Scene()
    scene.background = new THREE.Color('#0a0a1a')

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100)
    camera.position.copy(DEFAULT_CAMERA)
    camera.lookAt(DEFAULT_LOOK_AT)

    renderer = createWebGLRenderer()
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor('#0a0a1a', 1)
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.background = '#0a0a1a'
    renderer.domElement.style.touchAction = 'none'
    container.appendChild(renderer.domElement)

    const view = new FirstPersonView(camera)
    view.syncFromCamera()

    const handDrivingRef = { current: false }
    view.attach(renderer.domElement, () => handDrivingRef.current)

    scene.add(new THREE.AmbientLight(0xffffff, 0.55))
    const sun = new THREE.DirectionalLight(0xffffff, 1.4)
    sun.position.set(5, 8, 5)
    scene.add(sun)
    const fill = new THREE.PointLight(0x6366f1, 0.7, 30)
    fill.position.set(-4, 2, 3)
    scene.add(fill)

    const contentGroup = new THREE.Group()
    scene.add(contentGroup)

    const grid = new THREE.GridHelper(48, 48, 0x818cf8, 0x4338ca)
    grid.position.y = 0.001
    contentGroup.add(grid)
    const axes = new THREE.AxesHelper(4)
    contentGroup.add(axes)

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(48, 48),
      new THREE.MeshStandardMaterial({
        color: '#12122a',
        roughness: 0.95,
        metalness: 0.05,
      }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -0.01
    contentGroup.add(floor)

    const cursor = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 16, 16),
      new THREE.MeshStandardMaterial({
        color: brushColorRef.current,
        emissive: brushColorRef.current,
        emissiveIntensity: 0.8,
      }),
    )
    cursor.visible = false
    scene.add(cursor)

    const strokeObjects = new Map<string, THREE.Mesh>()

    function syncStrokes() {
      const current = strokesRef.current
      const ids = new Set(current.map((s) => s.id))

      for (const [id, mesh] of strokeObjects) {
        if (!ids.has(id)) {
          contentGroup.remove(mesh)
          mesh.geometry.dispose()
          ;(mesh.material as THREE.Material).dispose()
          strokeObjects.delete(id)
        }
      }

      for (const stroke of current) {
        const existing = strokeObjects.get(stroke.id)
        if (existing) {
          contentGroup.remove(existing)
          existing.geometry.dispose()
          ;(existing.material as THREE.Material).dispose()
        }
        const mesh = createStrokeMesh(stroke)
        if (mesh) {
          contentGroup.add(mesh)
          strokeObjects.set(stroke.id, mesh)
        }
      }
    }

    syncStrokes()

    const prevOrientRef = { current: null as HandState['navOrientation'] }
    const wasZoomingRef = { current: false }
    const wasDrawingRef = { current: false }
    const zoomStartSpanRef = { current: null as number | null }
    const smoothPointRef = { current: null as THREE.Vector3 | null }
    const targetPointRef = new THREE.Vector3()

    let targetRoll = 0
    let smoothRoll = 0
    let sceneRoll = 0
    let viewSynced = false
    let lastViewResetKey = viewResetKeyRef.current

    const yawFilter = new OneEuroFilter(0.7, 0.004)
    const pitchFilter = new OneEuroFilter(0.7, 0.004)
    const rollFilter = new OneEuroFilter(0.7, 0.004)

    function syncViewFromCamera() {
      view.syncFromCamera()
      targetRoll = sceneRoll
      smoothRoll = sceneRoll
      viewSynced = true
    }

    function resetView() {
      view.reset(DEFAULT_CAMERA, DEFAULT_LOOK_AT)
      sceneRoll = 0
      targetRoll = 0
      smoothRoll = 0
      prevOrientRef.current = null
      wasZoomingRef.current = false
      zoomStartSpanRef.current = null
      viewSynced = false
      syncViewFromCamera()
    }

    function resize() {
      if (!container) return
      const w = Math.max(container.clientWidth, 1)
      const h = Math.max(container.clientHeight, 1)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h, false)
    }

    resize()
    view.applyOrientation(sceneRoll)
    renderer.render(scene, camera)

    const resizeObserver = new ResizeObserver(() => {
      resize()
      renderer.render(scene, camera)
    })
    resizeObserver.observe(container)

    let lastStrokeSig = strokesRef.current
      .map((s) => `${s.id}:${s.points.length}`)
      .join('|')
    let lastBrush = brushColorRef.current
    let lastTime = performance.now()

    function frame(now: number) {
      frameId = requestAnimationFrame(frame)
      const delta = Math.min((now - lastTime) / 1000, 0.05)
      lastTime = now
      const dtScale = Math.min(delta * 60, 2)

      if (viewResetKeyRef.current !== lastViewResetKey) {
        lastViewResetKey = viewResetKeyRef.current
        if (lastViewResetKey > 0) resetView()
      }

      const strokeSig = strokesRef.current
        .map((s) => `${s.id}:${s.points.length}`)
        .join('|')
      if (strokeSig !== lastStrokeSig) {
        lastStrokeSig = strokeSig
        syncStrokes()
      }

      if (brushColorRef.current !== lastBrush) {
        lastBrush = brushColorRef.current
        const mat = cursor.material as THREE.MeshStandardMaterial
        mat.color.set(lastBrush)
        mat.emissive.set(lastBrush)
      }

      contentGroup.rotation.z = sceneRoll

      const handState = handStateRef.current
      const settings = settingsRef.current

      if (handState && settings) {
        if (!viewSynced) syncViewFromCamera()

        const handDrivingView = handState.isNavigating || handState.isZooming
        handDrivingRef.current = handDrivingView

        const orientGain = orientationRotationGain(settings.rotationSensitivity)
        const rollGain = rollRotationGain(settings.rotationSensitivity)
        const zoomGain = zoomMultiplier(settings.zoomSensitivity)
        const rollLerp = view.rollLerpFactor(settings.rotationSensitivity)

        if (
          handState.isNavigating &&
          !handState.isZooming &&
          handState.navOrientation &&
          !prevOrientRef.current
        ) {
          syncViewFromCamera()
          prevOrientRef.current = { ...handState.navOrientation }
        }

        if (handState.isNavigating && !handState.isZooming && handState.navOrientation) {
          if (prevOrientRef.current) {
            const { yaw, pitch, roll } = orientationDelta(
              prevOrientRef.current,
              handState.navOrientation,
            )
            if (Math.abs(yaw) > 0.0008) {
              view.targetYaw -= yawFilter.filter(yaw, now) * orientGain
            }
            if (Math.abs(pitch) > 0.0008) {
              view.targetPitch -= pitchFilter.filter(pitch, now) * orientGain
              view.targetPitch = THREE.MathUtils.clamp(
                view.targetPitch,
                view.minPitch,
                view.maxPitch,
              )
            }
            if (Math.abs(roll) > 0.0008) {
              targetRoll += rollFilter.filter(roll, now) * rollGain
            }
          }
          prevOrientRef.current = { ...handState.navOrientation }
        } else if (!handState.isNavigating) {
          if (!handState.isZooming) prevOrientRef.current = null
        }

        if (handState.isZooming && !handState.isNavigating && handState.handsSpread != null && handState.handsSpread > 0) {
          if (!wasZoomingRef.current) {
            syncViewFromCamera()
            zoomStartSpanRef.current = handState.handsSpread
            view.beginZoomSession()
          }
          if (zoomStartSpanRef.current) {
            view.updateHandZoom(
              handState.handsSpread,
              zoomStartSpanRef.current,
              zoomGain,
              dtScale,
            )
          }
        } else if (wasZoomingRef.current) {
          zoomStartSpanRef.current = null
          view.endZoomSession()
        }
        wasZoomingRef.current = handState.isZooming

        view.smoothTowardTargets(dtScale, settings)
        if (handState.isNavigating) {
          smoothRoll = THREE.MathUtils.lerp(
            smoothRoll,
            targetRoll,
            1 - Math.pow(1 - rollLerp, dtScale),
          )
        } else {
          targetRoll = THREE.MathUtils.lerp(targetRoll, 0, 1 - Math.pow(1 - rollLerp, dtScale))
          smoothRoll = THREE.MathUtils.lerp(
            smoothRoll,
            targetRoll,
            1 - Math.pow(1 - rollLerp, dtScale),
          )
        }
        sceneRoll = smoothRoll
        view.applyOrientation(sceneRoll)

        const drawing = handState.isDrawing && handState.drawLandmark
        const viewChanging = Boolean(drawing && handDrivingView)

        if (drawing) {
          const raw = landmarkToWorldFromCamera(
            handState.drawLandmark!,
            camera,
            handState.drawWorldLandmark,
            handState.drawWristWorldLandmark,
            settings.trackingSensitivity,
            DRAW_REFERENCE_DISTANCE,
          )

          if (raw.every(Number.isFinite)) {
            targetPointRef.set(raw[0], raw[1], raw[2])
            if (!smoothPointRef.current || viewChanging) {
              smoothPointRef.current = targetPointRef.clone()
            } else {
              const gap = smoothPointRef.current.distanceTo(targetPointRef)
              const baseLerp = drawLerpFactor(settings.trackingSensitivity)
              const adaptive = THREE.MathUtils.clamp(
                baseLerp + gap * drawCatchupBoost(settings.trackingSensitivity),
                baseLerp,
                0.96,
              )
              const lerp = 1 - Math.pow(1 - adaptive, Math.min(delta * 60, 2.5))
              smoothPointRef.current.lerp(targetPointRef, lerp)
            }
            cursor.position.copy(smoothPointRef.current)
            cursor.visible = true
            onDrawUpdateRef.current([smoothPointRef.current.x, smoothPointRef.current.y, smoothPointRef.current.z])
          }
        } else {
          cursor.visible = false
          if (wasDrawingRef.current) onDrawUpdateRef.current(null)
          smoothPointRef.current = null
        }
        wasDrawingRef.current = Boolean(drawing)
      } else {
        handDrivingRef.current = false
        const fallbackSettings = settingsRef.current
        if (fallbackSettings) {
          view.smoothTowardTargets(dtScale, fallbackSettings)
        }
        view.applyOrientation(sceneRoll)
      }

      renderer.render(scene, camera)
    }

    frameId = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(frameId)
      resizeObserver.disconnect()
      view.dispose()
      for (const mesh of strokeObjects.values()) {
        disposeObject3D(mesh)
      }
      disposeObject3D(cursor)
      disposeObject3D(grid)
      disposeObject3D(axes)
      disposeObject3D(floor)
      renderer.dispose()
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement)
      }
    }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : '3D view failed to initialize.'
      setInitError(message)
      return () => {}
    }
  }, [sceneKey])

  if (initError) {
    return (
      <div className="scene-error scene-canvas-wrap">
        <h2>3D view failed to load</h2>
        <p>{initError}</p>
        <button
          type="button"
          onClick={() => {
            setInitError(null)
            setSceneKey((k) => k + 1)
          }}
        >
          Retry
        </button>
      </div>
    )
  }

  return <div ref={containerRef} className="scene-canvas-wrap" />
}
