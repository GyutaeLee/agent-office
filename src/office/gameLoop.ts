// Adapted from AgentRoom / Pixel Agents (MIT); see THIRD_PARTY_NOTICES.md.
const MAX_DELTA_TIME_SEC = 0.05

export interface GameLoopCallbacks {
  update: (dt: number) => void
  render: (ctx: CanvasRenderingContext2D) => void
}

export function startGameLoop(
  canvas: HTMLCanvasElement,
  callbacks: GameLoopCallbacks,
): () => void {
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false

  let lastTime = 0
  let rafId = 0
  let stopped = false
  let lastRender = 0

  const frame = (time: number) => {
    if (stopped) return
    if (time - lastRender < 1000 / 30) {
      rafId = requestAnimationFrame(frame)
      return
    }
    lastRender = time
    const dt = lastTime === 0 ? 0 : Math.min((time - lastTime) / 1000, MAX_DELTA_TIME_SEC)
    lastTime = time

    callbacks.update(dt)

    ctx.imageSmoothingEnabled = false
    callbacks.render(ctx)

    rafId = requestAnimationFrame(frame)
  }

  rafId = requestAnimationFrame(frame)

  return () => {
    stopped = true
    cancelAnimationFrame(rafId)
  }
}
