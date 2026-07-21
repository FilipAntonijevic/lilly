import type { FaceLandmarkPoint, FaceZoneId, MakeupProduct } from '../types'
import type { EditableTryOnPolygon, Point2D } from './tryOnRegions'
import { TRYON_BASE_ALPHA, TRYON_BLEND, TRYON_DRAW_ORDER } from './tryOnRegions'

/**
 * Industry-style try-on compositing (ModiFace / MediaPipe makeup pattern):
 * 1) Build an alpha mask from landmark polygons
 * 2) Punch out eye openings / inner mouth so color stays on skin
 * 3) Feather with blur (+ radial falloff for blush)
 * 4) Tint and soft-blend onto the photo
 */

/** Person's left eye opening (sclera) — cut from eyeshadow. */
export const LEFT_EYE_OPENING = [
  33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246,
] as const

/** Person's right eye opening (sclera). */
export const RIGHT_EYE_OPENING = [
  263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466,
] as const

/** Inner mouth — keep lipstick on lips only. */
export const INNER_MOUTH = [
  78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82,
  81, 80, 191,
] as const

export interface ZonePaintState {
  intensity: number
  product: MakeupProduct | null
}

const FEATHER_BY_ZONE: Record<FaceZoneId, number> = {
  faceBase: 0.045,
  underEye: 0.028,
  cheeks: 0.055,
  contour: 0.04,
  lips: 0.012,
  eyes: 0.02,
}

export function paintSoftMakeup(options: {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  polygons: EditableTryOnPolygon[]
  layers: Record<FaceZoneId, ZonePaintState>
  landmarks: FaceLandmarkPoint[]
}): void {
  const { ctx, width, height, polygons, layers, landmarks } = options
  const byId = new Map(polygons.map((p) => [p.id, p]))
  const minSide = Math.min(width, height)

  for (const id of TRYON_DRAW_ORDER) {
    const poly = byId.get(id)
    if (!poly || poly.points.length < 3) continue
    const zoneLayer = layers[poly.zoneId]
    if (!zoneLayer?.product || zoneLayer.intensity <= 0.01) continue

    const strength = TRYON_BASE_ALPHA[poly.zoneId] * zoneLayer.intensity
    if (strength <= 0.01) continue

    const mask = buildZoneMask({
      width,
      height,
      poly,
      landmarks,
      minSide,
    })
    if (!mask) continue

    const tinted = document.createElement('canvas')
    tinted.width = width
    tinted.height = height
    const tctx = tinted.getContext('2d')
    if (!tctx) continue

    tctx.fillStyle = zoneLayer.product.shadeHex
    tctx.fillRect(0, 0, width, height)
    tctx.globalCompositeOperation = 'destination-in'
    tctx.drawImage(mask, 0, 0)

    ctx.save()
    ctx.globalAlpha = strength
    ctx.globalCompositeOperation = TRYON_BLEND[poly.zoneId]
    ctx.drawImage(tinted, 0, 0)
    ctx.restore()
  }
}

function buildZoneMask(options: {
  width: number
  height: number
  poly: EditableTryOnPolygon
  landmarks: FaceLandmarkPoint[]
  minSide: number
}): HTMLCanvasElement | null {
  const { width, height, poly, landmarks, minSide } = options
  const mask = document.createElement('canvas')
  mask.width = width
  mask.height = height
  const mctx = mask.getContext('2d')
  if (!mctx) return null

  mctx.fillStyle = '#fff'
  pathFromPoints(mctx, poly.points, width, height)
  mctx.fill()

  // Cut eyeball / inner mouth so makeup stays on skin / lips.
  mctx.globalCompositeOperation = 'destination-out'
  if (poly.id === 'leftEye') {
    punchLandmarkRing(mctx, landmarks, LEFT_EYE_OPENING, width, height, 1.06)
  } else if (poly.id === 'rightEye') {
    punchLandmarkRing(mctx, landmarks, RIGHT_EYE_OPENING, width, height, 1.06)
  } else if (poly.id === 'lips') {
    punchLandmarkRing(mctx, landmarks, INNER_MOUTH, width, height, 1.0)
  }
  mctx.globalCompositeOperation = 'source-over'

  // Blush / cheeks / contour: soft radial falloff toward edges.
  if (
    poly.zoneId === 'cheeks' ||
    poly.zoneId === 'contour' ||
    poly.zoneId === 'underEye' ||
    poly.zoneId === 'faceBase'
  ) {
    applyRadialFalloff(mctx, poly.points, width, height, poly.zoneId)
  }

  // Eyeshadow: denser near lid crease, softer toward brow.
  if (poly.zoneId === 'eyes') {
    applyLidFalloff(mctx, poly.points, width, height)
  }

  const blurPx = Math.max(2, Math.round(minSide * FEATHER_BY_ZONE[poly.zoneId]))
  return featherMask(mask, blurPx)
}

function punchLandmarkRing(
  ctx: CanvasRenderingContext2D,
  landmarks: FaceLandmarkPoint[],
  indices: readonly number[],
  width: number,
  height: number,
  pad: number,
): void {
  const points = pointsFromIndices(landmarks, indices)
  if (points.length < 3) return
  const padded = pad === 1 ? points : scaleAboutCentroid(points, pad)
  pathFromPoints(ctx, padded, width, height)
  ctx.fill()
}

function applyRadialFalloff(
  ctx: CanvasRenderingContext2D,
  points: Point2D[],
  width: number,
  height: number,
  zoneId: FaceZoneId,
): void {
  const { cx, cy, radius } = boundsOf(points, width, height)
  const inner =
    zoneId === 'cheeks' ? radius * 0.15 : zoneId === 'faceBase' ? radius * 0.35 : radius * 0.2
  const outer = zoneId === 'faceBase' ? radius * 1.05 : radius * 0.95
  const gradient = ctx.createRadialGradient(cx, cy, inner, cx, cy, Math.max(outer, 1))
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.55, 'rgba(255,255,255,0.65)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.globalCompositeOperation = 'destination-in'
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)
  ctx.globalCompositeOperation = 'source-over'
}

function applyLidFalloff(
  ctx: CanvasRenderingContext2D,
  points: Point2D[],
  width: number,
  height: number,
): void {
  const { minX, maxX, minY, maxY } = normBounds(points)
  const top = minY * height
  const bottom = maxY * height
  const left = minX * width
  const right = maxX * width
  const gradient = ctx.createLinearGradient(0, bottom, 0, top)
  // Stronger near the lid (bottom of eyeshadow poly), softer toward brow.
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.75)')
  gradient.addColorStop(1, 'rgba(255,255,255,0.05)')
  ctx.globalCompositeOperation = 'destination-in'
  ctx.fillStyle = gradient
  ctx.fillRect(left - 4, top - 4, right - left + 8, bottom - top + 8)
  ctx.globalCompositeOperation = 'source-over'
}

function featherMask(src: HTMLCanvasElement, blurPx: number): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = src.width
  out.height = src.height
  const ctx = out.getContext('2d')
  if (!ctx) return src
  ctx.filter = `blur(${blurPx}px)`
  ctx.drawImage(src, 0, 0)
  ctx.filter = 'none'
  return out
}

function pointsFromIndices(
  landmarks: FaceLandmarkPoint[],
  indices: readonly number[],
): Point2D[] {
  const points: Point2D[] = []
  for (const index of indices) {
    const lm = landmarks[index]
    if (!lm) continue
    points.push({ x: clamp01(lm.x), y: clamp01(lm.y) })
  }
  return points
}

function scaleAboutCentroid(points: Point2D[], factor: number): Point2D[] {
  let sx = 0
  let sy = 0
  for (const p of points) {
    sx += p.x
    sy += p.y
  }
  const cx = sx / points.length
  const cy = sy / points.length
  return points.map((p) => ({
    x: clamp01(cx + (p.x - cx) * factor),
    y: clamp01(cy + (p.y - cy) * factor),
  }))
}

function boundsOf(
  points: Point2D[],
  width: number,
  height: number,
): { cx: number; cy: number; radius: number } {
  const b = normBounds(points)
  const cx = ((b.minX + b.maxX) / 2) * width
  const cy = ((b.minY + b.maxY) / 2) * height
  const rw = ((b.maxX - b.minX) / 2) * width
  const rh = ((b.maxY - b.minY) / 2) * height
  return { cx, cy, radius: Math.max(rw, rh, 1) }
}

function normBounds(points: Point2D[]): {
  minX: number
  maxX: number
  minY: number
  maxY: number
} {
  let minX = 1
  let maxX = 0
  let minY = 1
  let maxY = 0
  for (const p of points) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  return { minX, maxX, minY, maxY }
}

function pathFromPoints(
  ctx: CanvasRenderingContext2D,
  points: Point2D[],
  width: number,
  height: number,
): void {
  ctx.beginPath()
  points.forEach((point, i) => {
    const x = point.x * width
    const y = point.y * height
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.closePath()
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}
