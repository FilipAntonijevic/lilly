import {
  TRYON_POLYGON_INDICES,
  type TryOnPolygonId,
} from './faceLandmarker'
import type {
  FaceLandmarkPoint,
  FaceZoneId,
  FaceZoneMatch,
} from '../types'
import type { MessageKey } from '../i18n/messages'

export interface Point2D {
  x: number
  y: number
}

export type TryOnShapeKind = 'polygon' | 'circle'

export interface EditableTryOnPolygon {
  id: TryOnPolygonId
  zoneId: FaceZoneId
  labelKey: MessageKey
  kind: TryOnShapeKind
  /** polygon: ring points; circle: [center, rim] */
  points: Point2D[]
}

export const TRYON_ZONE_BY_POLYGON: Record<TryOnPolygonId, FaceZoneId> = {
  leftEye: 'eyes',
  rightEye: 'eyes',
  lips: 'lips',
  leftCheek: 'cheeks',
  rightCheek: 'cheeks',
  underEyeLeft: 'underEye',
  underEyeRight: 'underEye',
  jawLeft: 'contour',
  jawRight: 'contour',
  faceOval: 'faceBase',
}

export const TRYON_LABEL_BY_POLYGON: Record<TryOnPolygonId, MessageKey> = {
  leftEye: 'tryon.region.leftEye',
  rightEye: 'tryon.region.rightEye',
  lips: 'tryon.region.lips',
  leftCheek: 'tryon.region.leftCheek',
  rightCheek: 'tryon.region.rightCheek',
  underEyeLeft: 'tryon.region.underEyeLeft',
  underEyeRight: 'tryon.region.underEyeRight',
  jawLeft: 'tryon.region.jawLeft',
  jawRight: 'tryon.region.jawRight',
  faceOval: 'tryon.region.faceOval',
}

/** Soft circular blush brushes only — under-eye is a landmark crescent again. */
export const CIRCLE_REGIONS: ReadonlySet<TryOnPolygonId> = new Set([
  'leftCheek',
  'rightCheek',
])

const CIRCLE_CENTER_INDEX: Partial<Record<TryOnPolygonId, number>> = {
  leftCheek: 205,
  rightCheek: 425,
}

export const TRYON_BLEND: Record<FaceZoneId, GlobalCompositeOperation> = {
  faceBase: 'soft-light',
  underEye: 'soft-light',
  cheeks: 'overlay',
  contour: 'multiply',
  lips: 'color',
  eyes: 'soft-light',
}

export const TRYON_BASE_ALPHA: Record<FaceZoneId, number> = {
  faceBase: 0.52,
  underEye: 0.68,
  cheeks: 0.78,
  // 2× previous strength: slider 50% ≈ old 100%, slider 100% ≈ old 200%.
  contour: 1.1,
  lips: 0.95,
  // 2× previous strength: slider 50% ≈ old 100%, slider 100% ≈ old 200%.
  eyes: 1.44,
}

export const TRYON_ZONE_ORDER: FaceZoneId[] = [
  'faceBase',
  'underEye',
  'cheeks',
  'contour',
  'lips',
  'eyes',
]

/** Grow only the lower vermilion past the landmark outline (+5% from lip centroid). */
export const LIPS_OUTLINE_SCALE = 1.05
/** OUTER_LIPS / try-on lips ring: upper cupid arc first, then lower. */
export const LIPS_UPPER_POINT_COUNT = 11

export function buildTryOnPolygons(
  landmarks: FaceLandmarkPoint[],
): EditableTryOnPolygon[] {
  const faceScale = estimateFaceScale(landmarks)
  const out: EditableTryOnPolygon[] = []

  for (const id of Object.keys(TRYON_POLYGON_INDICES) as TryOnPolygonId[]) {
    if (CIRCLE_REGIONS.has(id)) {
      const centerIdx = CIRCLE_CENTER_INDEX[id]
      const centerLm = centerIdx != null ? landmarks[centerIdx] : null
      if (!centerLm) continue
      // faceScale ≈ inter-ocular distance in norm space (~0.12–0.25).
      // Keep blush on the apple; paint path also clips to the face oval.
      const radius = faceScale * 0.34
      const center = { x: clamp01(centerLm.x), y: clamp01(centerLm.y) }
      // Slightly toward the nose / down so the soft circle stays on skin.
      if (id === 'leftCheek') {
        center.x = clamp01(center.x + faceScale * 0.02)
        center.y = clamp01(center.y + faceScale * 0.03)
      } else if (id === 'rightCheek') {
        center.x = clamp01(center.x - faceScale * 0.02)
        center.y = clamp01(center.y + faceScale * 0.03)
      }
      out.push({
        id,
        zoneId: TRYON_ZONE_BY_POLYGON[id],
        labelKey: TRYON_LABEL_BY_POLYGON[id],
        kind: 'circle',
        points: [center, { x: clamp01(center.x + radius), y: center.y }],
      })
      continue
    }

    const indices = TRYON_POLYGON_INDICES[id]
    let points: Point2D[] = []
    for (const index of indices) {
      const lm = landmarks[index]
      if (!lm) continue
      points.push({ x: clamp01(lm.x), y: clamp01(lm.y) })
    }
    if (points.length < 3) continue
    if (id === 'lips') {
      points = expandLowerLipOutline(points, LIPS_OUTLINE_SCALE)
    }
    if (id === 'underEyeLeft' || id === 'underEyeRight') {
      points = deepenUnderEyeCrescent(points)
    }
    out.push({
      id,
      zoneId: TRYON_ZONE_BY_POLYGON[id],
      labelKey: TRYON_LABEL_BY_POLYGON[id],
      kind: 'polygon',
      points,
    })
  }

  return out
}

export function polygonsForZone(
  polygons: EditableTryOnPolygon[],
  zoneId: FaceZoneId,
): EditableTryOnPolygon[] {
  return polygons.filter((p) => p.zoneId === zoneId)
}

export function clonePolygons(
  polygons: EditableTryOnPolygon[],
): EditableTryOnPolygon[] {
  return polygons.map((poly) => ({
    ...poly,
    points: poly.points.map((p) => ({ ...p })),
  }))
}

export function shadeForZone(
  routine: FaceZoneMatch[],
  zoneId: FaceZoneId,
): string | null {
  return routine.find((z) => z.zoneId === zoneId)?.match?.product.shadeHex ?? null
}

function estimateFaceScale(landmarks: FaceLandmarkPoint[]): number {
  const a = landmarks[33]
  const b = landmarks[263]
  if (a && b) {
    return Math.max(0.08, Math.hypot(a.x - b.x, a.y - b.y))
  }
  return 0.12
}

/** Scale a closed ring from its centroid (e.g. 1.05 = +5% lip coverage). */
export function expandPolygonFromCentroid(
  points: Point2D[],
  scale: number,
): Point2D[] {
  if (points.length < 3 || !(scale > 0)) return points.map((p) => ({ ...p }))
  let sx = 0
  let sy = 0
  for (const p of points) {
    sx += p.x
    sy += p.y
  }
  const cx = sx / points.length
  const cy = sy / points.length
  return points.map((p) => ({
    x: clamp01(cx + (p.x - cx) * scale),
    y: clamp01(cy + (p.y - cy) * scale),
  }))
}

/**
 * Keep upper lip on MediaPipe outline; grow only the lower vermilion by `scale`
 * (default +5%) from the lower-lip centroid so coverage overlaps skin below.
 */
export function expandLowerLipOutline(
  points: Point2D[],
  scale: number = LIPS_OUTLINE_SCALE,
): Point2D[] {
  if (points.length < 3 || !(scale > 0)) return points.map((p) => ({ ...p }))

  // Full outer ring is upper(11) then lower(9): [61…291, 375…146].
  const split =
    points.length >= LIPS_UPPER_POINT_COUNT + 3
      ? LIPS_UPPER_POINT_COUNT
      : -1

  let minY = Infinity
  let maxY = -Infinity
  for (const p of points) {
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  const lipH = Math.max(1e-4, maxY - minY)
  const midY = (minY + maxY) / 2

  const lowerIdx: number[] = []
  for (let i = 0; i < points.length; i++) {
    const isLower =
      split >= 0 ? i >= split : points[i]!.y >= midY - lipH * 0.02
    if (isLower) lowerIdx.push(i)
  }
  if (lowerIdx.length < 2) return points.map((p) => ({ ...p }))

  let lcx = 0
  let lcy = 0
  for (const i of lowerIdx) {
    lcx += points[i]!.x
    lcy += points[i]!.y
  }
  lcx /= lowerIdx.length
  lcy /= lowerIdx.length

  // +5% from lower centroid, plus a clear downward nudge (5% of lip height)
  // so the bottom edge visibly grows without moving the cupid’s bow.
  const downNudge = lipH * (scale - 1)

  const lowerSet = new Set(lowerIdx)
  return points.map((p, i) => {
    if (!lowerSet.has(i)) return { x: p.x, y: p.y }
    return {
      x: clamp01(lcx + (p.x - lcx) * scale),
      y: clamp01(lcy + (p.y - lcy) * scale + downNudge),
    }
  })
}

/** Lower-lash (first 9) stays put; infraorbital edge drops slightly for tear-trough fill. */
function deepenUnderEyeCrescent(points: Point2D[]): Point2D[] {
  const lidCount = 9
  if (points.length <= lidCount) return points.map((p) => ({ ...p }))
  let lidCy = 0
  for (let i = 0; i < lidCount; i++) lidCy += points[i]!.y
  lidCy /= lidCount
  return points.map((p, i) => {
    if (i < lidCount) return { ...p }
    return {
      x: p.x,
      y: clamp01(p.y + Math.max(0, (p.y - lidCy) * 0.35 + 0.008)),
    }
  })
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}
