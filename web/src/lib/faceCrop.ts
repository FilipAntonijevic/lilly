import type { Landmark } from './faceLandmarker'

/**
 * Crop a square around face + hairline for hair / skin ML classifiers.
 */
export function cropFaceForMl(
  source: HTMLCanvasElement,
  landmarks: Landmark[] | null,
): HTMLCanvasElement {
  const { width, height } = source
  let x0 = width * 0.18
  let y0 = height * 0.02
  let x1 = width * 0.82
  let y1 = height * 0.78

  if (landmarks?.length) {
    let minX = 1
    let minY = 1
    let maxX = 0
    let maxY = 0
    for (const lm of landmarks) {
      minX = Math.min(minX, lm.x)
      minY = Math.min(minY, lm.y)
      maxX = Math.max(maxX, lm.x)
      maxY = Math.max(maxY, lm.y)
    }
    const padX = (maxX - minX) * 0.22
    const padTop = (maxY - minY) * 0.55
    const padBottom = (maxY - minY) * 0.12
    x0 = Math.max(0, (minX - padX) * width)
    y0 = Math.max(0, (minY - padTop) * height)
    x1 = Math.min(width, (maxX + padX) * width)
    y1 = Math.min(height, (maxY + padBottom) * height)
  }

  const side = Math.max(64, Math.min(x1 - x0, y1 - y0))
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const sx = Math.max(0, Math.min(width - side, cx - side / 2))
  const sy = Math.max(0, Math.min(height - side, cy - side / 2))

  const out = document.createElement('canvas')
  out.width = 224
  out.height = 224
  const ctx = out.getContext('2d')
  if (!ctx) return source
  ctx.drawImage(source, sx, sy, side, side, 0, 0, 224, 224)
  return out
}
