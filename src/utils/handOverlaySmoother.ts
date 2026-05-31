import type { HandLandmark } from '../types/hand'

/** Fast follow for on-screen skeleton — high follow = tighter stick to the hand. */
export class HandOverlaySmoother {
  private hands: HandLandmark[][] = []

  reset() {
    this.hands = []
  }

  update(hands: HandLandmark[][], follow = 0.78): HandLandmark[][] {
    if (hands.length === 0) {
      this.hands = []
      return []
    }

    if (this.hands.length !== hands.length) {
      this.hands = hands.map((hand) => hand.map((lm) => ({ ...lm })))
      return this.hands
    }

    const out: HandLandmark[][] = []
    for (let h = 0; h < hands.length; h++) {
      const target = hands[h]
      const prev = this.hands[h]
      if (!prev || prev.length !== target.length) {
        this.hands[h] = target.map((lm) => ({ ...lm }))
        out.push(this.hands[h])
        continue
      }

      const next: HandLandmark[] = []
      for (let i = 0; i < target.length; i++) {
        const t = target[i]
        const p = prev[i]
        next.push({
          x: p.x + (t.x - p.x) * follow,
          y: p.y + (t.y - p.y) * follow,
          z: p.z + (t.z - p.z) * follow,
        })
      }
      this.hands[h] = next
      out.push(next)
    }

    return out
  }
}
