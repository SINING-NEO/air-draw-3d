import * as THREE from 'three'
import {
  rotationLerpFactor,
  rollLerpFactor,
} from '../config/tracking'
import type { TrackingSettings } from '../types/hand'

/** Fixed draw depth reference — strokes stay in front of the camera, not world center. */
export const DRAW_REFERENCE_DISTANCE = 8

const MIN_PITCH = -Math.PI / 2 + 0.08
const MAX_PITCH = Math.PI / 2 - 0.08
const MOUSE_ROTATE_SPEED = 1.15
const WHEEL_MOVE_SPEED = 0.012
const HAND_ZOOM_MOVE_SPEED = 2.4

const _forward = new THREE.Vector3()
const _euler = new THREE.Euler(0, 0, 0, 'YXZ')

export class FirstPersonView {
  targetYaw = 0
  targetPitch = 0
  smoothYaw = 0
  smoothPitch = 0

  private zoomRatio = 1
  private prevZoomRatio = 1

  private dragging = false
  private lastPointerX = 0
  private lastPointerY = 0
  private domElement: HTMLElement | null = null
  private isHandDriving: (() => boolean) | null = null

  private readonly onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || this.isHandDriving?.()) return
    this.dragging = true
    this.lastPointerX = event.clientX
    this.lastPointerY = event.clientY
    this.domElement?.setPointerCapture(event.pointerId)
  }

  private readonly onPointerMove = (event: PointerEvent) => {
    if (!this.dragging || this.isHandDriving?.()) return
    const dx = event.clientX - this.lastPointerX
    const dy = event.clientY - this.lastPointerY
    this.lastPointerX = event.clientX
    this.lastPointerY = event.clientY
    this.rotateBy(dx * 0.003 * MOUSE_ROTATE_SPEED, dy * 0.003 * MOUSE_ROTATE_SPEED)
  }

  private readonly onPointerUp = (event: PointerEvent) => {
    if (!this.dragging) return
    this.dragging = false
    try {
      this.domElement?.releasePointerCapture(event.pointerId)
    } catch {
      /* capture may already be released */
    }
  }

  private readonly onWheel = (event: WheelEvent) => {
    if (this.isHandDriving?.()) return
    event.preventDefault()
    this.moveForward(-event.deltaY * WHEEL_MOVE_SPEED)
  }

  private camera: THREE.PerspectiveCamera

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera
  }

  attach(domElement: HTMLElement, isHandDriving: () => boolean) {
    this.domElement = domElement
    this.isHandDriving = isHandDriving
    domElement.addEventListener('pointerdown', this.onPointerDown)
    domElement.addEventListener('pointermove', this.onPointerMove)
    domElement.addEventListener('pointerup', this.onPointerUp)
    domElement.addEventListener('pointerleave', this.onPointerUp)
    domElement.addEventListener('wheel', this.onWheel, { passive: false })
  }

  dispose() {
    if (!this.domElement) return
    this.domElement.removeEventListener('pointerdown', this.onPointerDown)
    this.domElement.removeEventListener('pointermove', this.onPointerMove)
    this.domElement.removeEventListener('pointerup', this.onPointerUp)
    this.domElement.removeEventListener('pointerleave', this.onPointerUp)
    this.domElement.removeEventListener('wheel', this.onWheel)
    this.domElement = null
    this.isHandDriving = null
  }

  syncFromCamera() {
    _euler.setFromQuaternion(this.camera.quaternion, 'YXZ')
    this.targetYaw = this.smoothYaw = _euler.y
    this.targetPitch = this.smoothPitch = _euler.x
  }

  reset(position: THREE.Vector3, lookAt: THREE.Vector3) {
    this.camera.position.copy(position)
    this.camera.lookAt(lookAt)
    this.syncFromCamera()
    this.endZoomSession()
    this.dragging = false
  }

  rotateBy(dYaw: number, dPitch: number) {
    this.targetYaw += dYaw
    this.targetPitch = THREE.MathUtils.clamp(this.targetPitch + dPitch, MIN_PITCH, MAX_PITCH)
  }

  setTargetAngles(yaw: number, pitch: number) {
    this.targetYaw = yaw
    this.targetPitch = THREE.MathUtils.clamp(pitch, MIN_PITCH, MAX_PITCH)
  }

  applyOrientation(sceneRoll: number) {
    _euler.set(this.smoothPitch, this.smoothYaw, sceneRoll)
    this.camera.quaternion.setFromEuler(_euler)
  }

  smoothTowardTargets(dtScale: number, settings: TrackingSettings) {
    const rotLerp = rotationLerpFactor(settings.rotationSensitivity)
    const tRot = 1 - Math.pow(1 - rotLerp, dtScale)
    this.smoothYaw = THREE.MathUtils.lerp(this.smoothYaw, this.targetYaw, tRot)
    this.smoothPitch = THREE.MathUtils.lerp(this.smoothPitch, this.targetPitch, tRot)
  }

  moveForward(amount: number) {
    if (!Number.isFinite(amount) || Math.abs(amount) < 1e-8) return
    this.camera.getWorldDirection(_forward)
    this.camera.position.addScaledVector(_forward, amount)
  }

  beginZoomSession() {
    this.zoomRatio = 1
    this.prevZoomRatio = 1
  }

  endZoomSession() {
    this.zoomRatio = 1
    this.prevZoomRatio = 1
  }

  /** Spread hands → ratio &gt; 1 → move forward; converge → move back. */
  updateHandZoom(spread: number, startSpread: number, zoomGain: number, dtScale: number) {
    if (startSpread <= 0) return
    this.zoomRatio = Math.max(0.25, spread / startSpread)
    const deltaLog = Math.log(this.zoomRatio) - Math.log(this.prevZoomRatio)
    const step = deltaLog * HAND_ZOOM_MOVE_SPEED * zoomGain * dtScale
    this.moveForward(step)
    this.prevZoomRatio = this.zoomRatio
  }


  get minPitch() {
    return MIN_PITCH
  }

  get maxPitch() {
    return MAX_PITCH
  }

  get rollLerpFactor() {
    return rollLerpFactor
  }
}
