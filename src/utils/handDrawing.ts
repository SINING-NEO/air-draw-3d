import type { HandLandmark } from '../types/hand'

// MediaPipe hand landmark connections for skeleton drawing
export const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
]

export function drawHandSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: { x: number; y: number }[],
  options: { connectorColor: string; landmarkColor: string; isDrawing: boolean },
) {
  ctx.strokeStyle = options.connectorColor
  ctx.lineWidth = 2.5
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  ctx.beginPath()
  for (const [a, b] of HAND_CONNECTIONS) {
    ctx.moveTo(landmarks[a].x, landmarks[a].y)
    ctx.lineTo(landmarks[b].x, landmarks[b].y)
  }
  ctx.stroke()

  ctx.fillStyle = options.landmarkColor
  for (const lm of landmarks) {
    ctx.beginPath()
    ctx.arc(lm.x, lm.y, 2.5, 0, Math.PI * 2)
    ctx.fill()
  }

  const tip = landmarks[8]
  ctx.beginPath()
  ctx.arc(tip.x, tip.y, options.isDrawing ? 12 : 7, 0, Math.PI * 2)
  ctx.strokeStyle = options.connectorColor
  ctx.lineWidth = 2.5
  ctx.stroke()
}

function toCanvasPoint(
  lm: HandLandmark,
  width: number,
  height: number,
): { x: number; y: number } {
  return { x: lm.x * width, y: lm.y * height }
}

/** Yellow palm focal markers + connector line for two-hand zoom. */
export function drawZoomFocalPoints(
  ctx: CanvasRenderingContext2D,
  focalPoints: [HandLandmark, HandLandmark],
  width: number,
  height: number,
  isZooming: boolean,
) {
  const [a, b] = focalPoints
  const p0 = toCanvasPoint(a, width, height)
  const p1 = toCanvasPoint(b, width, height)
  const midX = (p0.x + p1.x) / 2
  const midY = (p0.y + p1.y) / 2

  ctx.save()
  ctx.setLineDash([10, 8])
  ctx.strokeStyle = isZooming ? '#fbbf24' : 'rgba(251, 191, 36, 0.55)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(p0.x, p0.y)
  ctx.lineTo(p1.x, p1.y)
  ctx.stroke()
  ctx.setLineDash([])

  for (const p of [p0, p1]) {
    ctx.beginPath()
    ctx.arc(p.x, p.y, 22, 0, Math.PI * 2)
    ctx.strokeStyle = '#fbbf24'
    ctx.lineWidth = 3
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2)
    ctx.fillStyle = '#fef9c3'
    ctx.fill()

    ctx.strokeStyle = '#fbbf24'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(p.x - 12, p.y)
    ctx.lineTo(p.x + 12, p.y)
    ctx.moveTo(p.x, p.y - 12)
    ctx.lineTo(p.x, p.y + 12)
    ctx.stroke()
  }

  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = '#fef9c3'
  ctx.strokeStyle = 'rgba(0,0,0,0.65)'
  ctx.lineWidth = 3
  const label = isZooming ? 'Spread = zoom in · Together = zoom out' : 'Move both yellow focal points'
  ctx.strokeText(label, midX, midY - 18)
  ctx.fillText(label, midX, midY - 18)

  ctx.restore()
}
