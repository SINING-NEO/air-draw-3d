import * as THREE from 'three'
import type { HandLandmark, HandOrientation } from '../types/hand'

const wrist = new THREE.Vector3()
const indexMcp = new THREE.Vector3()
const middleMcp = new THREE.Vector3()
const middleTip = new THREE.Vector3()
const pinkyMcp = new THREE.Vector3()
const forward = new THREE.Vector3()
const across = new THREE.Vector3()
const palmNormal = new THREE.Vector3()
const basis = new THREE.Matrix4()
const euler = new THREE.Euler()

function lmToVec(lm: HandLandmark, target: THREE.Vector3): THREE.Vector3 {
  return target.set(
    (0.5 - lm.x) * 2,
    -(lm.y - 0.5) * 2,
    -lm.z * 2,
  )
}

/** Estimate palm yaw / pitch / roll from landmark positions (world preferred). */
export function getHandOrientation(landmarks: HandLandmark[]): HandOrientation {
  lmToVec(landmarks[0], wrist)
  lmToVec(landmarks[5], indexMcp)
  lmToVec(landmarks[9], middleMcp)
  lmToVec(landmarks[12], middleTip)
  lmToVec(landmarks[17], pinkyMcp)

  forward.subVectors(middleTip, wrist).normalize()
  across.subVectors(pinkyMcp, indexMcp).normalize()
  palmNormal.crossVectors(forward, across).normalize()

  if (palmNormal.lengthSq() < 0.01) {
    return { yaw: 0, pitch: 0, roll: 0 }
  }

  basis.makeBasis(across, forward, palmNormal)
  euler.setFromRotationMatrix(basis, 'YXZ')

  return {
    yaw: euler.y,
    pitch: euler.x,
    roll: euler.z,
  }
}

export function orientationDelta(
  prev: HandOrientation,
  curr: HandOrientation,
): HandOrientation {
  const unwrap = (a: number, b: number) => {
    let d = b - a
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    return d
  }

  return {
    yaw: unwrap(prev.yaw, curr.yaw),
    pitch: unwrap(prev.pitch, curr.pitch),
    roll: unwrap(prev.roll, curr.roll),
  }
}
