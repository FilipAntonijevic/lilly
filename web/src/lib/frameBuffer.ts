export const FRAME_INTERVAL_MS = 100
export const FRAME_BUFFER_SIZE = 10

export interface BufferedFrame {
  /** JPEG data URL */
  dataUrl: string
  capturedAt: number
}

/**
 * Fixed-size ring buffer — always keeps at most FRAME_BUFFER_SIZE frames.
 */
export class FrameRingBuffer {
  private frames: BufferedFrame[] = []
  private readonly maxSize: number

  constructor(maxSize = FRAME_BUFFER_SIZE) {
    this.maxSize = maxSize
  }

  push(frame: BufferedFrame): void {
    this.frames.push(frame)
    if (this.frames.length > this.maxSize) {
      this.frames.splice(0, this.frames.length - this.maxSize)
    }
  }

  /** Oldest → newest copy of current buffer */
  snapshot(): BufferedFrame[] {
    return this.frames.map((f) => ({ ...f }))
  }

  clear(): void {
    this.frames = []
  }

  get size(): number {
    return this.frames.length
  }
}

/** Grab a mirrored JPEG frame from a playing video element. */
export function grabVideoFrame(
  video: HTMLVideoElement,
  options?: { maxWidth?: number; quality?: number },
): string | null {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh) return null

  const maxWidth = options?.maxWidth ?? 640
  const quality = options?.quality ?? 0.72
  const scale = Math.min(1, maxWidth / vw)
  const w = Math.max(1, Math.round(vw * scale))
  const h = Math.max(1, Math.round(vh * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.translate(w, 0)
  ctx.scale(-1, 1)
  ctx.drawImage(video, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', quality)
}
