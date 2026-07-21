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

export interface EditableTryOnPolygon {
  id: TryOnPolygonId
  zoneId: FaceZoneId
  labelKey: MessageKey
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

/** Draw order: base first, color accents last. */
export const TRYON_DRAW_ORDER: TryOnPolygonId[] = [
  'faceOval',
  'jawLeft',
  'jawRight',
  'underEyeLeft',
  'underEyeRight',
  'leftCheek',
  'rightCheek',
  'leftEye',
  'rightEye',
  'lips',
]

export const TRYON_BLEND: Record<FaceZoneId, GlobalCompositeOperation> = {
  faceBase: 'soft-light',
  underEye: 'soft-light',
  cheeks: 'soft-light',
  contour: 'multiply',
  lips: 'source-over',
  eyes: 'multiply',
}

/** Base opacity at full intensity (1.0). */
export const TRYON_BASE_ALPHA: Record<FaceZoneId, number> = {
  faceBase: 0.38,
  underEye: 0.42,
  cheeks: 0.48,
  contour: 0.32,
  lips: 0.58,
  eyes: 0.42,
}

export function buildTryOnPolygons(
  landmarks: FaceLandmarkPoint[],
): EditableTryOnPolygon[] {
  return (Object.keys(TRYON_POLYGON_INDICES) as TryOnPolygonId[]).map((id) => {
    const indices = TRYON_POLYGON_INDICES[id]
    const points: Point2D[] = []
    for (const index of indices) {
      const lm = landmarks[index]
      if (!lm) continue
      points.push({
        x: clamp01(lm.x),
        y: clamp01(lm.y),
      })
    }
    return {
      id,
      zoneId: TRYON_ZONE_BY_POLYGON[id],
      labelKey: TRYON_LABEL_BY_POLYGON[id],
      points,
    }
  }).filter((poly) => poly.points.length >= 3)
}

export function shadeForZone(
  routine: FaceZoneMatch[],
  zoneId: FaceZoneId,
): string | null {
  return routine.find((z) => z.zoneId === zoneId)?.match?.product.shadeHex ?? null
}

export function clonePolygons(
  polygons: EditableTryOnPolygon[],
): EditableTryOnPolygon[] {
  return polygons.map((poly) => ({
    ...poly,
    points: poly.points.map((p) => ({ ...p })),
  }))
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}
