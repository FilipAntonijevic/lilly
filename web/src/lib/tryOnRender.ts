import type { FaceLandmarkPoint, FaceZoneId, MakeupProduct } from '../types'
import type { EditableTryOnPolygon, Point2D } from './tryOnRegions'
import { TRYON_BASE_ALPHA } from './tryOnRegions'

/**
 * Production-oriented makeup compositing (ModiFace / Snap Lens Studio patterns):
 * 1) Smooth Catmull-Rom rings instead of jagged polygon edges
 * 2) Feathered alpha masks (Gaussian blur)
 * 3) Soft-light / multiply so skin texture & lighting stay visible
 * 4) Lips: crisp vermilion + soft-light body + subtle gloss highlight
 * 5) Eyes: lid / crease / outer layers with sclera punched out
 */

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

const LEFT_LID = [247, 30, 29, 27, 28, 56, 190, 173, 157, 158, 159, 160, 161, 246] as const
const LEFT_CREASE = [113, 225, 224, 223, 222, 221, 189, 190, 56, 28, 27, 29, 30, 247] as const
const LEFT_OUTER = [33, 246, 161, 160, 159, 247, 30, 29, 27, 130, 25, 110, 24] as const

const RIGHT_LID = [467, 260, 259, 257, 258, 286, 414, 398, 384, 385, 386, 387, 388, 466] as const
const RIGHT_CREASE = [342, 445, 444, 443, 442, 441, 413, 414, 286, 258, 257, 259, 260, 467] as const
const RIGHT_OUTER = [263, 466, 388, 387, 386, 467, 260, 259, 257, 359, 255, 339, 254] as const

/** Upper-lip gloss anchors (cupid’s bow / center). */
const LIP_GLOSS = [0, 267, 37, 13] as const

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
    const mask = featheredSmoothRing(poly.points, width, height, minSide * 0.055, {
      radialCore: 0.35,
    })
    // Keep foundation off lips / sclera (Snap Face Mask opacity carve-outs).
    punchOpeningsFromMask(mask, landmarks, width, height)
    paintColorThroughMask(ctx, mask, layers.faceBase.product!.shadeHex, alpha, 'soft-light')
  })

  paintZoneIfActive(layers, 'contour', (alpha) => {
    for (const id of ['jawLeft', 'jawRight'] as const) {
      const poly = polygons.find((p) => p.id === id)
      if (!poly || poly.points.length < 3) continue
      const mask = featheredSmoothRing(poly.points, width, height, minSide * 0.02)
      paintColorThroughMask(ctx, mask, layers.contour.product!.shadeHex, alpha * 0.92, 'multiply')
      // Second softer multiply pass for depth without harsh edges.
      paintColorThroughMask(
        ctx,
        featheredSmoothRing(poly.points, width, height, minSide * 0.04),
        layers.contour.product!.shadeHex,
        alpha * 0.35,
        'multiply',
      )
    }
  })

  paintZoneIfActive(layers, 'underEye', (alpha) => {
    for (const id of ['underEyeLeft', 'underEyeRight'] as const) {
      const poly = polygons.find((p) => p.id === id)
      if (!poly || poly.kind !== 'circle' || poly.points.length < 2) continue
      const mask = softCircleMask(
        poly.points[0],
        circleRadius(poly),
        width,
        height,
        minSide * 0.03,
      )
      paintColorThroughMask(ctx, mask, layers.underEye.product!.shadeHex, alpha, 'soft-light')
    }
  })

  paintZoneIfActive(layers, 'cheeks', (alpha) => {
    for (const id of ['leftCheek', 'rightCheek'] as const) {
      const poly = polygons.find((p) => p.id === id)
      if (!poly || poly.kind !== 'circle' || poly.points.length < 2) continue
      const mask = softCircleMask(
        poly.points[0],
        circleRadius(poly),
        width,
        height,
        minSide * 0.045,
      )
      paintColorThroughMask(ctx, mask, layers.cheeks.product!.shadeHex, alpha, 'soft-light')
      // Warm lift pass (lighter).
      paintColorThroughMask(ctx, mask, layers.cheeks.product!.shadeHex, alpha * 0.25, 'overlay')
    }
  })

  paintZoneIfActive(layers, 'eyes', (alpha) => {
    paintEyeLayers(ctx, landmarks, width, height, layers.eyes.product!.shadeHex, alpha, minSide)
  })

  paintZoneIfActive(layers, 'lips', (alpha) => {
    const poly = polygons.find((p) => p.id === 'lips')
    paintLips(ctx, landmarks, poly?.points, width, height, layers.lips.product!.shadeHex, alpha, minSide)
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

function paintLips(
  ctx: CanvasRenderingContext2D,
  landmarks: FaceLandmarkPoint[],
  editable: Point2D[] | undefined,
  width: number,
  height: number,
  hex: string,
  alpha: number,
  minSide: number,
): void {
  const outer =
    editable && editable.length >= 3
      ? editable
      : pointsFromIndices(landmarks, OUTER_LIPS)
  if (outer.length < 3) return

  // Slight outward expand along normals (cleaner than centroid scale).
  const widened = expandRing(outer, 0.006)
  const mask = createCanvas(width, height)
  const mctx = mask.getContext('2d')
  if (!mctx) return

  mctx.fillStyle = '#fff'
  pathSmoothRing(mctx, widened, width, height)
  mctx.fill()
  mctx.globalCompositeOperation = 'destination-out'
  punchSmoothRing(mctx, landmarks, INNER_MOUTH, width, height, -0.004)
  mctx.globalCompositeOperation = 'source-over'

  // Tiny edge soften so anti-alias looks production-clean, not spray.
  const bodyMask = featherMask(mask, Math.max(0.8, minSide * 0.0035))

  // Snap/Lens Studio recipe: Soft Light body + light Multiply for depth.
  paintColorThroughMask(ctx, bodyMask, hex, alpha, 'soft-light')
  paintColorThroughMask(ctx, bodyMask, hex, alpha * 0.35, 'multiply')

  // Specular gloss along upper lip (Screen) — matte products still get a hint.
  const gloss = lipGlossMask(landmarks, width, height, minSide)
  if (gloss) {
    paintColorThroughMask(ctx, gloss, '#ffffff', alpha * 0.22, 'screen')
  }
}

function lipGlossMask(
  landmarks: FaceLandmarkPoint[],
  width: number,
  height: number,
  minSide: number,
): HTMLCanvasElement | null {
  const pts = pointsFromIndices(landmarks, LIP_GLOSS)
  if (pts.length < 2) return null
  let sx = 0
  let sy = 0
  for (const p of pts) {
    sx += p.x
    sy += p.y
  }
  const cx = (sx / pts.length) * width
  const cy = (sy / pts.length) * height - minSide * 0.004
  const rx = minSide * 0.055
  const ry = minSide * 0.012
  const mask = createCanvas(width, height)
  const mctx = mask.getContext('2d')!
  const g = mctx.createRadialGradient(cx, cy, 0, cx, cy, rx)
  g.addColorStop(0, 'rgba(255,255,255,0.95)')
  g.addColorStop(0.55, 'rgba(255,255,255,0.35)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  mctx.fillStyle = g
  mctx.beginPath()
  mctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
  mctx.fill()
  return featherMask(mask, minSide * 0.01)
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
  const pairs = [
    { lid: LEFT_LID, crease: LEFT_CREASE, outer: LEFT_OUTER, opening: LEFT_EYE_OPENING },
    { lid: RIGHT_LID, crease: RIGHT_CREASE, outer: RIGHT_OUTER, opening: RIGHT_EYE_OPENING },
  ] as const

  for (const eye of pairs) {
    const crease = eyeBandMask(landmarks, eye.crease, eye.opening, width, height, minSide * 0.016)
    paintColorThroughMask(ctx, crease, hex, alpha * 0.5, 'multiply')

    const outer = eyeBandMask(landmarks, eye.outer, eye.opening, width, height, minSide * 0.012)
    paintColorThroughMask(ctx, outer, hex, alpha * 0.55, 'multiply')

    const lid = eyeBandMask(landmarks, eye.lid, eye.opening, width, height, minSide * 0.007)
    paintColorThroughMask(ctx, lid, hex, alpha * 0.85, 'soft-light')
    paintColorThroughMask(ctx, lid, hex, alpha * 0.25, 'overlay')
  }
}

function eyeBandMask(
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
  pathSmoothRing(mctx, pts, width, height)
  mctx.fill()
  mctx.globalCompositeOperation = 'destination-out'
  punchSmoothRing(mctx, landmarks, opening, width, height, 0.004)
  mctx.globalCompositeOperation = 'source-over'
  return featherMask(mask, blurPx)
}

/**
 * Paint product color through an alpha mask using a production blend mode.
 * Soft-light / multiply keep pores & lighting instead of flat paint.
 */
function paintColorThroughMask(
  ctx: CanvasRenderingContext2D,
  mask: HTMLCanvasElement,
  hex: string,
  alpha: number,
  blend: GlobalCompositeOperation,
): void {
  if (alpha <= 0.01) return
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

function featheredSmoothRing(
  points: Point2D[],
  width: number,
  height: number,
  blurPx: number,
  opts?: { radialCore?: number },
): HTMLCanvasElement {
  const mask = createCanvas(width, height)
  const mctx = mask.getContext('2d')!
  mctx.fillStyle = '#fff'
  pathSmoothRing(mctx, points, width, height)
  mctx.fill()
  if (opts?.radialCore != null) {
    const { cx, cy, radius } = boundsOf(points, width, height)
    const g = mctx.createRadialGradient(
      cx,
      cy,
      radius * opts.radialCore,
      cx,
      cy,
      radius * 1.02,
    )
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.7, 'rgba(255,255,255,0.75)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    mctx.globalCompositeOperation = 'destination-in'
    mctx.fillStyle = g
    mctx.fillRect(0, 0, width, height)
    mctx.globalCompositeOperation = 'source-over'
  }
  return featherMask(mask, blurPx)
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
  const gradient = mctx.createRadialGradient(cx, cy, r * 0.08, cx, cy, r)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.75)')
  gradient.addColorStop(0.75, 'rgba(255,255,255,0.28)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  mctx.fillStyle = gradient
  mctx.beginPath()
  mctx.arc(cx, cy, r, 0, Math.PI * 2)
  mctx.fill()
  return featherMask(mask, blurPx)
}

function punchSmoothRing(
  ctx: CanvasRenderingContext2D,
  landmarks: FaceLandmarkPoint[],
  indices: readonly number[],
  width: number,
  height: number,
  expandNorm: number,
): void {
  let points = pointsFromIndices(landmarks, indices)
  if (points.length < 3) return
  if (expandNorm !== 0) points = expandRing(points, expandNorm)
  pathSmoothRing(ctx, points, width, height)
  ctx.fill()
}

function punchOpeningsFromMask(
  mask: HTMLCanvasElement,
  landmarks: FaceLandmarkPoint[],
  width: number,
  height: number,
): void {
  const mctx = mask.getContext('2d')
  if (!mctx) return
  mctx.save()
  mctx.globalCompositeOperation = 'destination-out'
  mctx.fillStyle = '#fff'
  // Slightly expanded so foundation doesn't kiss the vermilion / lash line.
  punchSmoothRing(mctx, landmarks, LEFT_EYE_OPENING, width, height, 0.012)
  punchSmoothRing(mctx, landmarks, RIGHT_EYE_OPENING, width, height, 0.012)
  punchSmoothRing(mctx, landmarks, OUTER_LIPS, width, height, 0.01)
  mctx.restore()
}

/** Closed Catmull-Rom → cubic Bézier ring (smooth industry contours). */
export function pathSmoothRing(
  ctx: CanvasRenderingContext2D,
  points: Point2D[],
  width: number,
  height: number,
): void {
  if (points.length < 3) {
    pathFromPoints(ctx, points, width, height)
    return
  }
  const pts = points.map((p) => ({ x: p.x * width, y: p.y * height }))
  const n = pts.length
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]
    const p1 = pts[i]
    const p2 = pts[(i + 1) % n]
    const p3 = pts[(i + 2) % n]
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y)
  }
  ctx.closePath()
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

/** Expand/shrink a closed ring along edge normals (normalized image space). */
function expandRing(points: Point2D[], amount: number): Point2D[] {
  const n = points.length
  if (n < 3) return points
  // Ensure consistent outward direction via signed area.
  let area = 0
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    area += points[i].x * points[j].y - points[j].x * points[i].y
  }
  const sign = area >= 0 ? 1 : -1
  const out: Point2D[] = []
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n]
    const next = points[(i + 1) % n]
    const dx = next.x - prev.x
    const dy = next.y - prev.y
    const len = Math.hypot(dx, dy) || 1
    const nx = (-dy / len) * sign
    const ny = (dx / len) * sign
    out.push({
      x: clamp01(points[i].x + nx * amount),
      y: clamp01(points[i].y + ny * amount),
    })
  }
  return out
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
  ctx.filter = `blur(${Math.max(0.4, blurPx)}px)`
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

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}
