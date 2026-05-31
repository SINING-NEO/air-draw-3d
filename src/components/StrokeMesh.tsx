import { useMemo } from 'react'
import * as THREE from 'three'
import type { Stroke } from '../types/hand'

interface StrokeMeshProps {
  stroke: Stroke
}

export function StrokeMesh({ stroke }: StrokeMeshProps) {
  const geometry = useMemo(() => {
    if (stroke.points.length < 2) return null

    const vectors = stroke.points.map(
      (p) => new THREE.Vector3(p[0], p[1], p[2]),
    )

    if (vectors.length === 2) {
      const mid = vectors[0].clone().lerp(vectors[1], 0.5)
      vectors.splice(1, 0, mid)
    }

    const curve = new THREE.CatmullRomCurve3(vectors, false, 'centripetal')
    const segments = Math.max(vectors.length * 8, 32)

    return new THREE.TubeGeometry(
      curve,
      segments,
      stroke.width,
      10,
      false,
    )
  }, [stroke])

  if (!geometry) return null

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color={stroke.color}
        emissive={stroke.color}
        emissiveIntensity={0.35}
        roughness={0.3}
        metalness={0.1}
      />
    </mesh>
  )
}
