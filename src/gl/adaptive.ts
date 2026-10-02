/**
 * Adaptive preview resolution: lowers the render scale when the frame rate stays
 * below the target and raises it again when there is headroom.
 */
export class AdaptiveScale {
  scale: number;
  fps = 0;
  private frames = 0;
  private windowStart = -1;

  constructor(
    readonly min = 0.35,
    readonly max = 1,
    readonly targetFps = 24,
    readonly headroomFps = 45,
    initial = 0.75,
  ) {
    this.scale = initial;
  }

  /** Call once per rendered frame with a timestamp in ms. Returns the current scale. */
  tick(now: number): number {
    if (this.windowStart < 0) {
      this.windowStart = now;
      this.frames = 0;
      return this.scale;
    }
    this.frames++;
    const elapsed = now - this.windowStart;
    if (elapsed >= 1000) {
      this.fps = (this.frames * 1000) / elapsed;
      if (this.fps < this.targetFps) this.scale = Math.max(this.min, this.scale * 0.85);
      else if (this.fps > this.headroomFps) this.scale = Math.min(this.max, this.scale * 1.08);
      this.windowStart = now;
      this.frames = 0;
    }
    return this.scale;
  }

  /** Forget timing history (e.g. after the app was hidden). */
  reset(): void {
    this.windowStart = -1;
    this.frames = 0;
  }
}
