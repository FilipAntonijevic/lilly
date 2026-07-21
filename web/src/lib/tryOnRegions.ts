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
  contour: 0.55,
  lips: 0.95,
  eyes: 0.72,
}

export const TRYON_ZONE_ORDER: FaceZoneId[] = [
  'faceBase',
  'underEye',
  'cheeks',
  'contour',
  'lips',
  'eyes',
]

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
      // Blush apple needs ~0.4× that — older 0.085 made ~12px dots that never showed.
      const radius = faceScale * 0.42
      const center = { x: clamp01(centerLm.x), y: clamp01(centerLm.y) }
      // Blush sits slightly toward the ear / temple on each cheek.
      if (id === 'leftCheek') {
        center.x = clamp01(center.x - faceScale * 0.04)
        center.y = clamp01(center.y + faceScale * 0.02)
      } else if (id === 'rightCheek') {
        center.x = clamp01(center.x + faceScale * 0.04)
        center.y = clamp01(center.y + faceScale * 0.02)
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
    const points: Point2D[] = []
    for (const index of indices) {
      const lm = landmarks[index]
      if (!lm) continue
      points.push({ x: clamp01(lm.x), y: clamp01(lm.y) })
    }
    if (points.length < 3) continue
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

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}
