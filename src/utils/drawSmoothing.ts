import type { HandLandmark } from '../types/hand'
import { OneEuroFilter3D } from './oneEuroFilter'

export class DrawTipFilter {
  private screen = new OneEuroFilter3D()
  private world = new OneEuroFilter3D()
  private wrist = new OneEuroFilter3D()

  setDrawSmoothness(level: number) {
    this.screen.setDrawSmoothness(level)
    this.world.setDrawDepthSmoothness(level)
    this.wrist.setDrawDepthSmoothness(Math.max(1, level - 1))
  }

  reset() {
    this.screen.reset()
    this.world.reset()
    this.wrist.reset()
  }

  filterScreen(tip: HandLandmark, timestamp: number): HandLandmark {
    const [x, y, z] = this.screen.filter(tip.x, tip.y, tip.z, timestamp)
    return { x, y, z }
  }

  filterWorld(tip: HandLandmark, timestamp: number): HandLandmark {
    const [x, y, z] = this.world.filter(tip.x, tip.y, tip.z, timestamp)
    return { x, y, z }
  }

  filterWrist(wrist: HandLandmark, timestamp: number): HandLandmark {
    const [x, y, z] = this.wrist.filter(wrist.x, wrist.y, wrist.z, timestamp)
    return { x, y, z }
  }
}

export function interpolatePoints(
  from: [number, number, number],
  to: [number, number, number],
  maxSegment: number,
): [number, number, number][] {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const dz = to[2] - from[2]
  const dist = Math.hypot(dx, dy, dz)

  if (dist <= maxSegment) return [to]

  const steps = Math.ceil(dist / maxSegment)
  const points: [number, number, number][] = []

  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    points.push([from[0] + dx * t, from[1] + dy * t, from[2] + dz * t])
  }

  return points
}
