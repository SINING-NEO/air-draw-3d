/** 1€ filter — smooth when slow, responsive when moving fast. */
class LowPassFilter {
  private y = 0
  private initialized = false

  filter(value: number, alpha: number): number {
    if (!this.initialized) {
      this.y = value
      this.initialized = true
      return value
    }
    this.y = alpha * value + (1 - alpha) * this.y
    return this.y
  }

  reset() {
    this.initialized = false
  }
}

export class OneEuroFilter {
  private x = new LowPassFilter()
  private dx = new LowPassFilter()
  private lastValue: number | null = null
  private lastTime: number | null = null
  private minCutoff: number
  private beta: number
  private dCutoff: number

  constructor(minCutoff = 1.4, beta = 0.012, dCutoff = 1.0) {
    this.minCutoff = minCutoff
    this.beta = beta
    this.dCutoff = dCutoff
  }

  setSmoothness(level: number) {
    this.minCutoff = 0.8 + level * 0.14
    this.beta = 0.006 + level * 0.002
  }

  /** Draw path — low lag, still filters micro-jitter when the hand is still. */
  setDrawSmoothness(level: number) {
    this.minCutoff = 1.6 + level * 0.5
    this.beta = 0.02 + level * 0.014
    this.dCutoff = 1.1 + level * 0.2
  }

  reset() {
    this.x.reset()
    this.dx.reset()
    this.lastValue = null
    this.lastTime = null
  }

  private alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff)
    return 1 / (1 + tau / dt)
  }

  filter(value: number, timestamp: number): number {
    if (this.lastValue === null || this.lastTime === null) {
      this.lastValue = value
      this.lastTime = timestamp
      return this.x.filter(value, this.alpha(this.minCutoff, 1 / 60))
    }

    const dt = Math.max((timestamp - this.lastTime) / 1000, 1 / 120)
    const derivative = (value - this.lastValue) / dt
    const filteredDerivative = this.dx.filter(
      derivative,
      this.alpha(this.dCutoff, dt),
    )
    const cutoff = this.minCutoff + this.beta * Math.abs(filteredDerivative)

    this.lastValue = value
    this.lastTime = timestamp
    return this.x.filter(value, this.alpha(cutoff, dt))
  }
}

export class OneEuroFilter3D {
  private fx = new OneEuroFilter()
  private fy = new OneEuroFilter()
  private fz = new OneEuroFilter()

  setSmoothness(level: number) {
    this.fx.setSmoothness(level)
    this.fy.setSmoothness(level)
    this.fz.setSmoothness(level)
  }

  setDrawSmoothness(level: number) {
    this.fx.setDrawSmoothness(level)
    this.fy.setDrawSmoothness(level)
    this.fz.setDrawSmoothness(level)
  }

  /** Depth axis — slightly smoother to reduce forward/back flicker. */
  setDrawDepthSmoothness(level: number) {
    this.fx.setDrawSmoothness(level)
    this.fy.setDrawSmoothness(level)
    this.fz.setDrawSmoothness(Math.max(1, level - 1))
  }

  reset() {
    this.fx.reset()
    this.fy.reset()
    this.fz.reset()
  }

  filter(x: number, y: number, z: number, timestamp: number): [number, number, number] {
    return [
      this.fx.filter(x, timestamp),
      this.fy.filter(y, timestamp),
      this.fz.filter(z, timestamp),
    ]
  }
}
