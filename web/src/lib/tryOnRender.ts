import type { FaceLandmarkPoint, FaceZoneId, MakeupProduct } from '../types'
import type { EditableTryOnPolygon, Point2D } from './tryOnRegions'
import { TRYON_BASE_ALPHA, TRYON_BLEND } from './tryOnRegions'

/**
 * Makeup compositing inspired by ModiFace / Sephora Virtual Artist:
 * - Lips: hard cut at (slightly widened) vermilion border — no spray feather
 * - Cheeks / under-eye: soft circular brushes on cheek / under-eye anchors
 * - Contour: MediaPipe cheek-hollow + jaw strips (feathered polygons)
 * - Eyes: lid + crease + outer-corner layers, eye opening punched out
 */

/** Outer vermilion (hard lipstick edge source). */
export const OUTER_LIPS = [
  61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84,
  181, 91, 146,
] as const

export const INNER_MOUTH = [
  78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82,
  81, 80, 191,
] as const

export const LEFT_EYE_OPENING = [
  33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246,
] as const

export const RIGHT_EYE_OPENING = [
  263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466,
] as const

/**
 * Sephora-style eyeshadow bands (MediaPipe / TFJS mesh annotations).
 * "rightEye*" in mesh coords = person's left eye (near landmark 33).
 */
const LEFT_LID = [247, 30, 29, 27, 28, 56, 190, 173, 157, 158, 159, 160, 161, 246] as const
const LEFT_CREASE = [113, 225, 224, 223, 222, 221, 189, 190, 56, 28, 27, 29, 30, 247] as const
const LEFT_OUTER = [33, 246, 161, 160, 159, 247, 30, 29, 27, 130, 25, 110, 24] as const

const RIGHT_LID = [467, 260, 259, 257, 258, 286, 414, 398, 384, 385, 386, 387, 388, 466] as const
const RIGHT_CREASE = [342, 445, 444, 443, 442, 441, 413, 414, 286, 258, 257, 259, 260, 467] as const
const RIGHT_OUTER = [263, 466, 388, 387, 386, 467, 260, 259, 257, 359, 255, 339, 254] as const

export interface ZonePaintState {
  intensity: number
  product: MakeupProduct | null
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
  const minSide = Math.min(width, height)

  paintZoneIfActive(layers, 'faceBase', (alpha) => {
    const poly = polygons.find((p) => p.id === 'faceOval')
    if (!poly) return
    const mask = softPolygonMask(poly.points, width, height, minSide * 0.05, 0.4)
    compositeMask(ctx, mask, layers.faceBase.product!.shadeHex, alpha, TRYON_BLEND.faceBase)
  })

  paintZoneIfActive(layers, 'contour', (alpha) => {
    for (const id of ['jawLeft', 'jawRight'] as const) {
      const poly = polygons.find((p) => p.id === id)
      if (!poly || poly.points.length < 3) continue
      // Elongated cheek-hollow strip: blur edges only (no radial that eats the ends).
      const mask = softStripMask(poly.points, width, height, minSide * 0.022)
      compositeMask(
        ctx,
        mask,
        layers.contour.product!.shadeHex,
        alpha,
        TRYON_BLEND.contour,
      )
    }
  })

  paintZoneIfActive(layers, 'underEye', (alpha) => {
    for (const id of ['underEyeLeft', 'underEyeRight'] as const) {
      const poly = polygons.find((p) => p.id === id)
      if (!poly || poly.kind !== 'circle' || poly.points.length < 2) continue
      const mask = softCircleMask(poly.points[0], circleRadius(poly), width, height, minSide * 0.025)
      compositeMask(ctx, mask, layers.underEye.product!.shadeHex, alpha, TRYON_BLEND.underEye)
    }
  })

  paintZoneIfActive(layers, 'cheeks', (alpha) => {
    for (const id of ['leftCheek', 'rightCheek'] as const) {
      const poly = polygons.find((p) => p.id === id)
      if (!poly || poly.kind !== 'circle' || poly.points.length < 2) continue
      const mask = softCircleMask(poly.points[0], circleRadius(poly), width, height, minSide * 0.04)
      compositeMask(ctx, mask, layers.cheeks.product!.shadeHex, alpha, TRYON_BLEND.cheeks)
    }
  })

  paintZoneIfActive(layers, 'eyes', (alpha) => {
    paintEyeLayers(ctx, landmarks, width, height, layers.eyes.product!.shadeHex, alpha, minSide)
  })

  paintZoneIfActive(layers, 'lips', (alpha) => {
    const poly = polygons.find((p) => p.id === 'lips')
    const mask = hardLipMask(landmarks, poly?.points, width, height)
    if (!mask) return
    compositeMask(ctx, mask, layers.lips.product!.shadeHex, alpha, 'source-over')
  })
}

function paintZoneIfActive(
  layers: Record<FaceZoneId, ZonePaintState>,
  zoneId: FaceZoneId,
  paint: (alpha: number) => void,
): void {
  const layer = layers[zoneId]
  if (!layer?.product || layer.intensity <= 0.01) return
  const alpha = TRYON_BASE_ALPHA[zoneId] * layer.intensity
  if (alpha <= 0.01) return
  paint(alpha)
}

/** Hard lipstick: slightly wider than lip edge, crisp boundary (no blur). */
function hardLipMask(
  landmarks: FaceLandmarkPoint[],
  editable: Point2D[] | undefined,
  width: number,
  height: number,
): HTMLCanvasElement | null {
  const outer =
    editable && editable.length >= 3
      ? editable
      : pointsFromIndices(landmarks, OUTER_LIPS)
  if (outer.length < 3) return null

  const widened = scaleAboutCentroid(outer, 1.045)
  const mask = createCanvas(width, height)
  const mctx = mask.getContext('2d')
  if (!mctx) return null

  mctx.fillStyle = '#fff'
  pathFromPoints(mctx, widened, width, height)
  mctx.fill()

  mctx.globalCompositeOperation = 'destination-out'
  punchLandmarkRing(mctx, landmarks, INNER_MOUTH, width, height, 0.96)
  mctx.globalCompositeOperation = 'source-over'
  return mask
}

function paintEyeLayers(
  ctx: CanvasRenderingContext2D,
  landmarks: FaceLandmarkPoint[],
  width: number,
  height: number,
  hex: string,
  alpha: number,
  minSide: number,
): void {
  const pairs: Array<{
    lid: readonly number[]
    crease: readonly number[]
    outer: readonly number[]
    opening: readonly number[]
  }> = [
    { lid: LEFT_LID, crease: LEFT_CREASE, outer: LEFT_OUTER, opening: LEFT_EYE_OPENING },
    { lid: RIGHT_LID, crease: RIGHT_CREASE, outer: RIGHT_OUTER, opening: RIGHT_EYE_OPENING },
  ]

  for (const eye of pairs) {
    // Crease (softer, above lid)
    const crease = bandMask(landmarks, eye.crease, eye.opening, width, height, minSide * 0.018)
    compositeMask(ctx, crease, hex, alpha * 0.55, 'soft-light')

    // Outer corner accent
    const outer = bandMask(landmarks, eye.outer, eye.opening, width, height, minSide * 0.014)
    compositeMask(ctx, outer, hex, alpha * 0.7, 'multiply')

    // Lid — strongest, mild feather only
    const lid = bandMask(landmarks, eye.lid, eye.opening, width, height, minSide * 0.008)
    compositeMask(ctx, lid, hex, alpha * 0.9, 'soft-light')
  }
}

function bandMask(
  landmarks: FaceLandmarkPoint[],
  ring: readonly number[],
  opening: readonly number[],
  width: number,
  height: number,
  blurPx: number,
): HTMLCanvasElement {
  const mask = createCanvas(width, height)
  const mctx = mask.getContext('2d')!
  const pts = pointsFromIndices(landmarks, ring)
  mctx.fillStyle = '#fff'
  pathFromPoints(mctx, pts, width, height)
  mctx.fill()
  mctx.globalCompositeOperation = 'destination-out'
  punchLandmarkRing(mctx, landmarks, opening, width, height, 1.02)
  mctx.globalCompositeOperation = 'source-over'
  return blurPx > 0.5 ? featherMask(mask, blurPx) : mask
}

function softCircleMask(
  center: Point2D,
  radiusNorm: number,
  width: number,
  height: number,
  blurPx: number,
): HTMLCanvasElement {
  const mask = createCanvas(width, height)
  const mctx = mask.getContext('2d')!
  const cx = center.x * width
  const cy = center.y * height
  const r = Math.max(4, radiusNorm * Math.min(width, height))
  const gradient = mctx.createRadialGradient(cx, cy, r * 0.12, cx, cy, r)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.7)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  mctx.fillStyle = gradient
  mctx.beginPath()
  mctx.arc(cx, cy, r, 0, Math.PI * 2)
  mctx.fill()
  return featherMask(mask, blurPx)
}

function softStripMask(
  points: Point2D[],
  width: number,
  height: number,
  blurPx: number,
): HTMLCanvasElement {
  const mask = createCanvas(width, height)
  const mctx = mask.getContext('2d')!
  mctx.fillStyle = '#fff'
  pathFromPoints(mctx, points, width, height)
  mctx.fill()
  return featherMask(mask, blurPx)
}

function softPolygonMask(
  points: Point2D[],
  width: number,
  height: number,
  blurPx: number,
  core: number,
): HTMLCanvasElement {
  const mask = createCanvas(width, height)
  const mctx = mask.getContext('2d')!
  mctx.fillStyle = '#fff'
  pathFromPoints(mctx, points, width, height)
  mctx.fill()
  const { cx, cy, radius } = boundsOf(points, width, height)
  const gradient = mctx.createRadialGradient(cx, cy, radius * core, cx, cy, radius * 1.05)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  mctx.globalCompositeOperation = 'destination-in'
  mctx.fillStyle = gradient
  mctx.fillRect(0, 0, width, height)
  mctx.globalCompositeOperation = 'source-over'
  return featherMask(mask, blurPx)
}

function compositeMask(
  ctx: CanvasRenderingContext2D,
  mask: HTMLCanvasElement,
  hex: string,
  alpha: number,
  blend: GlobalCompositeOperation,
): void {
  const tinted = createCanvas(mask.width, mask.height)
  const tctx = tinted.getContext('2d')
  if (!tctx) return
  tctx.fillStyle = hex
  tctx.fillRect(0, 0, mask.width, mask.height)
  tctx.globalCompositeOperation = 'destination-in'
  tctx.drawImage(mask, 0, 0)

  ctx.save()
  ctx.globalAlpha = Math.min(1, Math.max(0, alpha))
  ctx.globalCompositeOperation = blend
  ctx.drawImage(tinted, 0, 0)
  ctx.restore()
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

function circleRadius(poly: EditableTryOnPolygon): number {
  if (poly.points.length < 2) return 0.06
  const [c, rim] = poly.points
  return Math.hypot(rim.x - c.x, rim.y - c.y)
}

function featherMask(src: HTMLCanvasElement, blurPx: number): HTMLCanvasElement {
  const out = createCanvas(src.width, src.height)
  const ctx = out.getContext('2d')
  if (!ctx) return src
  ctx.filter = `blur(${Math.max(0.5, blurPx)}px)`
  ctx.drawImage(src, 0, 0)
  ctx.filter = 'none'
  return out
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  return c
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
  const cx = ((minX + maxX) / 2) * width
  const cy = ((minY + maxY) / 2) * height
  const rw = ((maxX - minX) / 2) * width
  const rh = ((maxY - minY) / 2) * height
  return { cx, cy, radius: Math.max(rw, rh, 1) }
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
