import * as THREE from 'three'

export function disposeObject3D(object: THREE.Object3D) {
  if ('dispose' in object && typeof object.dispose === 'function') {
    ;(object as THREE.Object3D & { dispose: () => void }).dispose()
    return
  }

  const mesh = object as THREE.Mesh
  mesh.geometry?.dispose()

  const material = mesh.material
  if (Array.isArray(material)) {
    material.forEach((m) => m.dispose())
  } else if (material) {
    material.dispose()
  }
}

export function createWebGLRenderer(): THREE.WebGLRenderer {
  try {
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'default',
      failIfMajorPerformanceCaveat: false,
    })
    return renderer
  } catch {
    throw new Error(
      'WebGL is not available. Update graphics drivers or try Chrome/Edge with hardware acceleration enabled.',
    )
  }
}
