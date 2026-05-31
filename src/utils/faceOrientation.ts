import * as THREE from 'three'
import type { Matrix } from '@mediapipe/tasks-vision'
import type { HandLandmark, HandOrientation } from '../types/hand'

const m4 = new THREE.Matrix4()
const basis = new THREE.Matrix4()
const euler = new THREE.Euler(0, 0, 0, 'YXZ')
const nose = new THREE.Vector3()
const chin = new THREE.Vector3()
const leftEye = new THREE.Vector3()
const rightEye = new THREE.Vector3()
const forward = new THREE.Vector3()
const across = new THREE.Vector3()
const up = new THREE.Vector3()

function lmToVec(lm: HandLandmark, target: THREE.Vector3): THREE.Vector3 {
  return target.set((0.5 - lm.x) * 2, -(lm.y - 0.5) * 2, -lm.z * 2)
}

function matrixToOrientation(matrix: Matrix): HandOrientation {
  const d = matrix.data
  if (d.length < 16) return { yaw: 0, pitch: 0, roll: 0 }

  // MediaPipe stores a row-major 4×4; Three.js expects column-major.
  m4.set(
    d[0], d[4], d[8], d[12],
    d[1], d[5], d[9], d[13],
    d[2], d[6], d[10], d[14],
    d[3], d[7], d[11], d[15],
  )
  euler.setFromRotationMatrix(m4, 'YXZ')

  // Front-facing webcam is mirrored — flip yaw so head turns match the view.
  return { yaw: -euler.y, pitch: euler.x, roll: euler.z }
}

function landmarksToOrientation(landmarks: HandLandmark[]): HandOrientation {
  lmToVec(landmarks[1], nose)
  lmToVec(landmarks[152], chin)
  lmToVec(landmarks[33], leftEye)
  lmToVec(landmarks[263], rightEye)

  forward.subVectors(chin, nose).normalize()
  across.subVectors(rightEye, leftEye).normalize()
  up.crossVectors(forward, across).normalize()
  if (up.lengthSq() < 1e-4) return { yaw: 0, pitch: 0, roll: 0 }

  across.crossVectors(up, forward).normalize()
  basis.makeBasis(across, up, forward.clone().negate())
  euler.setFromRotationMatrix(basis, 'YXZ')

  return { yaw: -euler.y, pitch: euler.x, roll: euler.z }
}

export function getFaceOrientation(
  landmarks: HandLandmark[] | undefined,
  transformMatrix?: Matrix,
): HandOrientation | null {
  if (transformMatrix?.data && transformMatrix.data.length >= 16) {
    return matrixToOrientation(transformMatrix)
  }
  if (landmarks && landmarks.length > 263) {
    return landmarksToOrientation(landmarks)
  }
  return null
}

export { orientationDelta } from './handOrientation'
