import type { FaceLandmarkPoint, FaceZoneId, MakeupProduct } from '../types'
import { hexToRgb, labToRgb, rgbToHex } from './color'
import { classifyLipShade } from './lipstickTheory'
import type { EditableTryOnPolygon, Point2D } from './tryOnRegions'
import {
  TRYON_BASE_ALPHA,
  buildDenseLipOutline,
  densifyClosedRing,
  chaikinClosed,
} from './tryOnRegions'

/**
 * Production-oriented makeup compositing (ModiFace / Snap Lens Studio patterns):
 * 1) Smooth Catmull-Rom rings instead of jagged polygon edges
 * 2) Feathered alpha masks (Gaussian blur) for skin products
 * 3) Soft-light / multiply / overlay so skin texture stays visible
 * 4) Lips: dense outline, shade-aware pigment film, soft vermilion edge + gloss
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

/** Lower lash + infraorbital (tear trough) — mesh right / left eye. */
const UNDER_EYE_LEFT_LID = [33, 7, 163, 144, 145, 153, 154, 155, 133] as const
const UNDER_EYE_LEFT_INFRA = [143, 111, 117, 118, 119, 120, 121, 128, 245] as const
const UNDER_EYE_RIGHT_LID = [263, 249, 390, 373, 374, 380, 381, 382, 362] as const
const UNDER_EYE_RIGHT_INFRA = [372, 340, 346, 347, 348, 349, 350, 357, 465] as const

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
    // Punch eyes/mouth on a hard mask first, then feather — keeps eye holes large
    // (feather-then-punch lets blur bleed foundation back into the openings).
    const hard = createCanvas(width, height)
    const hctx = hard.getContext('2d')
    if (!hctx) return
    hctx.fillStyle = '#fff'
    pathSmoothRing(hctx, poly.points, width, height)
    hctx.fill()
    // Eye holes: from eyeshadow lower edge → under-eye upper edge (+ mouth).
    punchFoundationOpenings(hard, landmarks, polygons, width, height)
    const mask = featherMask(hard, minSide * 0.022)
    paintColorThroughMask(ctx, mask, layers.faceBase.product!.shadeHex, alpha, 'soft-light')
    paintColorThroughMask(ctx, mask, layers.faceBase.product!.shadeHex, alpha * 0.4, 'color')
  })

  paintZoneIfActive(layers, 'contour', (alpha) => {
    paintContour(
      ctx,
      landmarks,
      polygons,
      width,
      height,
      layers.contour.product!.shadeHex,
      alpha,
      minSide,
    )
  })

  paintZoneIfActive(layers, 'underEye', (alpha) => {
    paintUnderEyeConcealer(
      ctx,
      landmarks,
      polygons,
      width,
      height,
      layers.underEye.product!.shadeHex,
      alpha,
      minSide,
    )
  })

  paintZoneIfActive(layers, 'cheeks', (alpha) => {
    const faceOval = polygons.find((p) => p.id === 'faceOval')
    // Slightly inset so blush never bleeds past the jaw / temple edge.
    const faceClip =
      faceOval && faceOval.points.length >= 3
        ? expandRing(faceOval.points, -0.012)
        : null
    for (const id of ['leftCheek', 'rightCheek'] as const) {
      const poly = polygons.find((p) => p.id === id)
      if (!poly || poly.kind !== 'circle' || poly.points.length < 2) continue
      let mask = softCircleMask(
        poly.points[0]!,
        circleRadius(poly),
        width,
        height,
        minSide * 0.028,
      )
      if (faceClip) {
        mask = clipMaskToRing(mask, faceClip, width, height)
      }
      paintColorThroughMask(ctx, mask, layers.cheeks.product!.shadeHex, alpha, 'overlay')
      paintColorThroughMask(ctx, mask, layers.cheeks.product!.shadeHex, alpha * 0.55, 'soft-light')
      // Pigment pass so blush reads even on muted catalog hexes.
      paintColorThroughMask(ctx, mask, layers.cheeks.product!.shadeHex, alpha * 0.28, 'source-over')
    }
  })

  paintZoneIfActive(layers, 'eyes', (alpha) => {
    paintEyeLayers(ctx, landmarks, width, height, layers.eyes.product!.shadeHex, alpha, minSide)
  })

  paintZoneIfActive(layers, 'lips', (alpha) => {
    const poly = polygons.find((p) => p.id === 'lips')
    paintLips(
      ctx,
      landmarks,
      poly?.points,
      width,
      height,
      layers.lips.product!.shadeHex,
      alpha,
      minSide,
    )
  })
}

/**
 * Contour only on facial bones: cheekbone (ear → zygoma) + jawline sides.
 * No chin tip — that is not a contour zone.
 */
function paintContour(
  ctx: CanvasRenderingContext2D,
  landmarks: FaceLandmarkPoint[],
  polygons: EditableTryOnPolygon[],
  width: number,
  height: number,
  hex: string,
  alpha: number,
  minSide: number,
): void {
  const faceOval = polygons.find((p) => p.id === 'faceOval')
  const faceClip =
    faceOval && faceOval.points.length >= 3
      ? expandRing(faceOval.points, -0.006)
      : null

  const clip = (mask: HTMLCanvasElement) =>
    faceClip ? clipMaskToRing(mask, faceClip, width, height) : mask

  // 1) Cheekbone: ear → under zygoma (bones, not chin)
  for (const side of ['left', 'right'] as const) {
    const hollow = clip(
      cheekHollowMask(landmarks, side, width, height, minSide),
    )
    paintColorThroughMask(ctx, hollow, hex, alpha * 0.68, 'multiply')
    paintColorThroughMask(ctx, hollow, hex, alpha * 0.45, 'soft-light')
  }

  // 2) Jawline sides only — stops before the chin tip
  for (const side of ['left', 'right'] as const) {
    const jaw = clip(
      jawlineBandMask(landmarks, side, width, height, minSide),
    )
    paintColorThroughMask(ctx, jaw, hex, alpha * 0.58, 'multiply')
    paintColorThroughMask(ctx, jaw, hex, alpha * 0.4, 'soft-light')
  }
}

/** Cheekbone contour: from the ear along the underside of the zygoma. */
function cheekHollowMask(
  landmarks: FaceLandmarkPoint[],
  side: 'left' | 'right',
  width: number,
  height: number,
  minSide: number,
): HTMLCanvasElement {
  // Ear → cheekbone ridge → mid hollow (stop well before mouth/chin).
  const indices =
    side === 'left'
      ? ([234, 227, 116, 111, 123, 147] as const)
      : ([454, 447, 345, 340, 352, 376] as const)

  const pts = pointsFromIndices(landmarks, indices)
  const mask = createCanvas(width, height)
  const mctx = mask.getContext('2d')
  if (!mctx || pts.length < 3) return mask

  const faceScale = estimateContourFaceScale(landmarks)
  // Sit just under the bone: slight down + slight inward.
  const pathPts = pts.map((p, i) => {
    const t = i / Math.max(1, pts.length - 1)
    const down = faceScale * (0.008 + t * 0.028)
    const inward = faceScale * (0.01 + t * 0.018) * (side === 'left' ? 1 : -1)
    return {
      x: clamp01(p.x + inward),
      y: clamp01(p.y + down),
    }
  })

  strokeSoftBand(mctx, pathPts, width, height, minSide, {
    wide: 0.105,
    mid: 0.07,
    core: 0.042,
  })
  return featherMask(mask, minSide * 0.02)
}

/**
 * Jaw bone contour: ear → mandibular angle → along the jaw side.
 * Stops before the chin tip (no 152 / chin pad).
 */
function jawlineBandMask(
  landmarks: FaceLandmarkPoint[],
  side: 'left' | 'right',
  width: number,
  height: number,
  minSide: number,
): HTMLCanvasElement {
  const indices =
    side === 'left'
      ? ([234, 93, 132, 58, 172, 136, 150] as const)
      : ([454, 323, 361, 288, 397, 365, 379] as const)

  const pts = pointsFromIndices(landmarks, indices)
  const mask = createCanvas(width, height)
  const mctx = mask.getContext('2d')
  if (!mctx || pts.length < 3) return mask

  const faceScale = estimateContourFaceScale(landmarks)
  const pathPts = pts.map((p, i) => {
    const t = i / Math.max(1, pts.length - 1)
    const inward = faceScale * (0.014 + t * 0.012) * (side === 'left' ? 1 : -1)
    const up = faceScale * 0.008
    return {
      x: clamp01(p.x + inward),
      y: clamp01(p.y - up),
    }
  })

  strokeSoftBand(mctx, pathPts, width, height, minSide, {
    wide: 0.09,
    mid: 0.058,
    core: 0.034,
  })
  return featherMask(mask, minSide * 0.018)
}

function strokeSoftBand(
  mctx: CanvasRenderingContext2D,
  pathPts: Point2D[],
  width: number,
  height: number,
  minSide: number,
  widths: { wide: number; mid: number; core: number },
): void {
  const stroke = (lineWidth: number, a: number) => {
    mctx.strokeStyle = `rgba(255,255,255,${a})`
    mctx.lineWidth = lineWidth
    mctx.lineCap = 'round'
    mctx.lineJoin = 'round'
    mctx.beginPath()
    pathPts.forEach((p, i) => {
      const x = p.x * width
      const y = p.y * height
      if (i === 0) mctx.moveTo(x, y)
      else mctx.lineTo(x, y)
    })
    mctx.stroke()
  }
  stroke(minSide * widths.wide, 0.42)
  stroke(minSide * widths.mid, 0.72)
  stroke(minSide * widths.core, 1)
}

function estimateContourFaceScale(landmarks: FaceLandmarkPoint[]): number {
  const a = landmarks[33]
  const b = landmarks[263]
  if (a && b) return Math.max(0.08, Math.hypot(a.x - b.x, a.y - b.y))
  return 0.12
}

function paintZoneIfActive(
  layers: Record<FaceZoneId, ZonePaintState>,
  zoneId: FaceZoneId,
  paint: (alpha: number) => void,
): void {
  const layer = layers[zoneId]
  if (!layer?.product?.shadeHex || layer.intensity <= 0.01) return
  const base = TRYON_BASE_ALPHA[zoneId] ?? 0.5
  const alpha = base * layer.intensity
  if (!(alpha > 0.01)) return
  try {
    paint(alpha)
  } catch {
    // One zone must never abort the rest of the face.
  }
}

function paintUnderEyeConcealer(
  ctx: CanvasRenderingContext2D,
  landmarks: FaceLandmarkPoint[],
  polygons: EditableTryOnPolygon[],
  width: number,
  height: number,
  hex: string,
  alpha: number,
  minSide: number,
): void {
  const sides = [
    {
      id: 'underEyeLeft' as const,
      lid: UNDER_EYE_LEFT_LID,
      infra: UNDER_EYE_LEFT_INFRA,
      opening: LEFT_EYE_OPENING,
    },
    {
      id: 'underEyeRight' as const,
      lid: UNDER_EYE_RIGHT_LID,
      infra: UNDER_EYE_RIGHT_INFRA,
      opening: RIGHT_EYE_OPENING,
    },
  ]

  for (const side of sides) {
    const editable = polygons.find((p) => p.id === side.id)
    const ring =
      editable && editable.points.length >= 3
        ? editable.points
        : buildUnderEyeCrescent(landmarks, side.lid, side.infra)
    if (ring.length < 3) continue

    const mask = createCanvas(width, height)
    const mctx = mask.getContext('2d')
    if (!mctx) continue

    mctx.fillStyle = '#fff'
    pathSmoothRing(mctx, ring, width, height)
    mctx.fill()

    // Fade toward the cheek so it reads like soft concealer, not a hard stamp.
    const { cx, cy, radius } = boundsOf(ring, width, height)
    const fade = mctx.createRadialGradient(cx, cy - radius * 0.35, radius * 0.15, cx, cy, radius * 1.15)
    fade.addColorStop(0, 'rgba(255,255,255,1)')
    fade.addColorStop(0.45, 'rgba(255,255,255,0.85)')
    fade.addColorStop(0.75, 'rgba(255,255,255,0.35)')
    fade.addColorStop(1, 'rgba(255,255,255,0)')
    mctx.globalCompositeOperation = 'destination-in'
    mctx.fillStyle = fade
    mctx.fillRect(0, 0, width, height)
    mctx.globalCompositeOperation = 'source-over'

    punchRingFromMask(mask, landmarks, side.opening, width, height, 0.008)
    const soft = featherMask(mask, Math.max(2, minSide * 0.02))

    paintColorThroughMask(ctx, soft, hex, alpha, 'soft-light')
    paintColorThroughMask(ctx, soft, hex, alpha * 0.4, 'color')
    paintColorThroughMask(ctx, soft, hex, alpha * 0.18, 'source-over')
  }
}

/** Closed crescent: lower lid outer→inner, then infraorbital inner→outer. */
function buildUnderEyeCrescent(
  landmarks: FaceLandmarkPoint[],
  lid: readonly number[],
  infra: readonly number[],
): Point2D[] {
  const top = pointsFromIndices(landmarks, lid)
  const bottom = pointsFromIndices(landmarks, [...infra].reverse())
  if (top.length < 3 || bottom.length < 3) return [...top, ...bottom]
  // Slightly deepen the cheek edge so concealer fills the tear trough.
  let lidCy = 0
  for (const p of top) lidCy += p.y
  lidCy /= top.length
  const deepened = bottom.map((p) => ({
    x: p.x,
    y: clamp01(p.y + Math.max(0, (p.y - lidCy) * 0.35 + 0.008)),
  }))
  return [...top, ...deepened]
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
  let outer =
    editable && editable.length >= 3
      ? editable
      : buildDenseLipOutline(landmarks)
  if (outer.length < 3) return

  // Editable polygons from buildTryOnPolygons are already dense; fallback is too.
  // If a short ring slips through, densify + smooth once more.
  if (outer.length < 36) {
    outer = chaikinClosed(densifyClosedRing(outer, 1), 1)
  }

  const mask = createCanvas(width, height)
  const mctx = mask.getContext('2d')
  if (!mctx) return

  mctx.fillStyle = '#fff'
  pathSmoothRing(mctx, outer, width, height)
  mctx.fill()
  mctx.globalCompositeOperation = 'destination-out'
  punchSmoothRing(mctx, landmarks, INNER_MOUTH, width, height, -0.002)
  mctx.globalCompositeOperation = 'source-over'

  // Soft outer film edge (still sharper than blush, not a hard sticker).
  const bodyMask = featherMask(mask, Math.max(1.1, minSide * 0.0055))

  const profile = classifyLipShade(hex)
  const photoLum = sampleMaskedLuminance(ctx, bodyMask)
  const paintHex = adjustLipHexForPhoto(hex, photoLum, profile)
  const stack = lipPaintStack(profile, photoLum)

  // Soft vermilion border — slight multiply darkening at the lip edge.
  const border = lipBorderMask(mask, width, height, minSide)
  if (border) {
    paintColorThroughMask(
      ctx,
      border,
      darkenHex(paintHex, 0.78),
      alpha * stack.border,
      'multiply',
    )
  }

  // Film body: keep photo texture, then pigment by shade family.
  paintColorThroughMask(ctx, bodyMask, paintHex, alpha * stack.color, 'color')
  paintColorThroughMask(ctx, bodyMask, paintHex, alpha * stack.softLight, 'soft-light')
  paintColorThroughMask(ctx, bodyMask, paintHex, alpha * stack.multiply, 'multiply')
  if (stack.sourceOver > 0.01) {
    paintColorThroughMask(
      ctx,
      bodyMask,
      paintHex,
      alpha * stack.sourceOver,
      'source-over',
    )
  }

  // Specular gloss — stronger on deep/cream shades, quieter on nudes.
  const gloss = lipGlossMask(landmarks, bodyMask, width, height, minSide)
  if (gloss && stack.gloss > 0.02) {
    paintColorThroughMask(ctx, gloss, '#ffffff', alpha * stack.gloss, 'screen')
  }
}

interface LipPaintStack {
  color: number
  softLight: number
  multiply: number
  sourceOver: number
  border: number
  gloss: number
}

function lipPaintStack(
  profile: ReturnType<typeof classifyLipShade>,
  photoLum: number,
): LipPaintStack {
  const L = profile.lab.L
  const isNude =
    profile.family === 'nude' ||
    (profile.family === 'pink' && L > 52 && profile.chroma < 32)
  const isDeep =
    L < 38 ||
    profile.family === 'plum' ||
    profile.family === 'berry' ||
    profile.family === 'brown' ||
    profile.family === 'cool_red' ||
    profile.family === 'warm_red'

  // Dark natural lips already carry luminance — ease opaque lifts.
  const darkPhoto = photoLum < 0.28
  const lightPhoto = photoLum > 0.55

  if (isNude) {
    return {
      color: 0.72,
      softLight: 0.42,
      multiply: darkPhoto ? 0.14 : 0.22,
      sourceOver: lightPhoto ? 0.08 : 0.04,
      border: 0.14,
      gloss: 0.1,
    }
  }

  if (isDeep) {
    return {
      color: 0.9,
      softLight: 0.22,
      multiply: darkPhoto ? 0.42 : 0.55,
      sourceOver: darkPhoto ? 0.14 : 0.22,
      border: 0.22,
      gloss: profile.family === 'brown' ? 0.16 : 0.3,
    }
  }

  // Mid / coral / pink statement
  return {
    color: 0.88,
    softLight: 0.3,
    multiply: 0.38,
    sourceOver: 0.14,
    border: 0.18,
    gloss: 0.2,
  }
}

/** Shift catalog hex toward photo lip luminance so nudes don’t plasticize. */
function adjustLipHexForPhoto(
  _hex: string,
  photoLum: number,
  profile: ReturnType<typeof classifyLipShade>,
): string {
  const lab = { ...profile.lab }
  const targetL = 18 + photoLum * 62
  const isNude =
    profile.family === 'nude' ||
    (profile.family === 'pink' && lab.L > 52 && profile.chroma < 32)

  if (isNude) {
    // Pull lightness toward the photo; gently mute chroma.
    lab.L = lab.L * 0.45 + targetL * 0.55
    lab.a *= 0.82
    lab.b *= 0.82
  } else if (lab.L > targetL + 18) {
    // Very light swatch on darker lips — bring down a notch.
    lab.L = lab.L * 0.7 + targetL * 0.3
  } else if (lab.L < targetL - 22 && profile.chroma > 28) {
    // Deep chromatic on pale lips — lift slightly so it doesn’t crush.
    lab.L = lab.L * 0.85 + targetL * 0.15
  }

  const [r, g, b] = labToRgb(lab)
  return rgbToHex(r, g, b)
}

function darkenHex(hex: string, factor: number): string {
  const [r, g, b] = hexToRgb(hex)
  return rgbToHex(
    Math.round(r * factor),
    Math.round(g * factor),
    Math.round(b * factor),
  )
}

/** Soft ring at the vermilion edge (outer feather minus tighter core). */
function lipBorderMask(
  hardMask: HTMLCanvasElement,
  width: number,
  height: number,
  minSide: number,
): HTMLCanvasElement | null {
  const outer = featherMask(hardMask, Math.max(1.4, minSide * 0.009))
  const core = featherMask(hardMask, Math.max(0.7, minSide * 0.0028))
  const border = createCanvas(width, height)
  const bctx = border.getContext('2d')
  if (!bctx) return null
  bctx.drawImage(outer, 0, 0)
  bctx.globalCompositeOperation = 'destination-out'
  bctx.drawImage(core, 0, 0)
  bctx.globalCompositeOperation = 'source-over'
  return border
}

function sampleMaskedLuminance(
  ctx: CanvasRenderingContext2D,
  mask: HTMLCanvasElement,
): number {
  const w = mask.width
  const h = mask.height
  const mctx = mask.getContext('2d', { willReadFrequently: true })
  if (!mctx) return 0.42
  let maskData: ImageData
  let photoData: ImageData
  try {
    maskData = mctx.getImageData(0, 0, w, h)
    photoData = ctx.getImageData(0, 0, w, h)
  } catch {
    return 0.42
  }

  const md = maskData.data
  const pd = photoData.data
  let sum = 0
  let n = 0
  const step = 4
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4
      if ((md[i + 3] ?? 0) < 120) continue
      const r = pd[i] ?? 0
      const g = pd[i + 1] ?? 0
      const b = pd[i + 2] ?? 0
      sum += 0.2126 * r + 0.7152 * g + 0.0722 * b
      n++
    }
  }
  return n > 0 ? sum / n / 255 : 0.42
}

function lipGlossMask(
  landmarks: FaceLandmarkPoint[],
  lipMask: HTMLCanvasElement,
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
  const cy = (sy / pts.length) * height - minSide * 0.003
  const rx = minSide * 0.042
  const ry = minSide * 0.009
  const mask = createCanvas(width, height)
  const mctx = mask.getContext('2d')!
  const g = mctx.createRadialGradient(cx, cy, 0, cx, cy, rx)
  g.addColorStop(0, 'rgba(255,255,255,0.9)')
  g.addColorStop(0.45, 'rgba(255,255,255,0.35)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  mctx.fillStyle = g
  mctx.beginPath()
  mctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
  mctx.fill()
  mctx.globalCompositeOperation = 'destination-in'
  mctx.drawImage(lipMask, 0, 0)
  return featherMask(mask, minSide * 0.007)
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
 *
 * Important: bake coverage into the source alpha. Many browsers ignore
 * `globalAlpha` (or apply it inconsistently) for non-source-over blends,
 * which made the intensity slider look broken.
 */
function paintColorThroughMask(
  ctx: CanvasRenderingContext2D,
  mask: HTMLCanvasElement,
  hex: string,
  alpha: number,
  blend: GlobalCompositeOperation,
): void {
  const coverage = Math.min(1, Math.max(0, alpha))
  if (coverage <= 0.01) return

  const fadedMask = createCanvas(mask.width, mask.height)
  const fctx = fadedMask.getContext('2d')
  if (!fctx) return
  fctx.globalAlpha = coverage
  fctx.drawImage(mask, 0, 0)

  const tinted = createCanvas(mask.width, mask.height)
  const tctx = tinted.getContext('2d')
  if (!tctx) return
  tctx.fillStyle = hex
  tctx.fillRect(0, 0, mask.width, mask.height)
  tctx.globalCompositeOperation = 'destination-in'
  tctx.drawImage(fadedMask, 0, 0)

  ctx.save()
  ctx.globalCompositeOperation = blend
  ctx.drawImage(tinted, 0, 0)
  ctx.restore()
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
  const gradient = mctx.createRadialGradient(cx, cy, 0, cx, cy, r)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.25, 'rgba(255,255,255,0.95)')
  gradient.addColorStop(0.55, 'rgba(255,255,255,0.55)')
  gradient.addColorStop(0.82, 'rgba(255,255,255,0.18)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  mctx.fillStyle = gradient
  mctx.beginPath()
  mctx.arc(cx, cy, r, 0, Math.PI * 2)
  mctx.fill()
  return featherMask(mask, blurPx)
}

/** Keep blush (etc.) inside the face oval — soft circles often spill past the jaw. */
function clipMaskToRing(
  mask: HTMLCanvasElement,
  ring: Point2D[],
  width: number,
  height: number,
): HTMLCanvasElement {
  if (ring.length < 3) return mask
  const mctx = mask.getContext('2d')
  if (!mctx) return mask
  mctx.save()
  mctx.globalCompositeOperation = 'destination-in'
  mctx.fillStyle = '#fff'
  pathSmoothRing(mctx, ring, width, height)
  mctx.fill()
  mctx.restore()
  return mask
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

/**
 * Foundation carve-outs.
 * Eye holes span from the lower edge of the eyeshadow (lid) polygon to the
 * upper edge of the under-eye polygon — larger than the bare sclera ring.
 */
function punchFoundationOpenings(
  mask: HTMLCanvasElement,
  landmarks: FaceLandmarkPoint[],
  polygons: EditableTryOnPolygon[],
  width: number,
  height: number,
): void {
  for (const side of ['left', 'right'] as const) {
    const ring = foundationEyeHoleRing(landmarks, polygons, side)
    // Expand before feather so the soft edge still clears lash-to-lash.
    if (ring.length >= 3) punchPointsFromMask(mask, ring, width, height, 0.02)
  }
  // Inner mouth only — covers teeth/cavity when open; thin slit when closed.
  punchRingFromMask(mask, landmarks, INNER_MOUTH, width, height, 0.004)
}

/** Lower lash / upper-lid chains that form the eyeshadow↔under-eye gap. */
const EYESHADOW_LOWER_LEFT = [173, 157, 158, 159, 160, 161, 246] as const
const EYESHADOW_LOWER_RIGHT = [398, 384, 385, 386, 387, 388, 466] as const
const UNDEREYE_UPPER_LEFT = [33, 7, 163, 144, 145, 153, 154, 155, 133] as const
const UNDEREYE_UPPER_RIGHT = [263, 249, 390, 373, 374, 380, 381, 382, 362] as const

/**
 * Closed ring: under-eye upper line (lower lashes) then eyeshadow lower line
 * (upper lashes) reversed — the full gap between those two polygons.
 */
function foundationEyeHoleRing(
  landmarks: FaceLandmarkPoint[],
  polygons: EditableTryOnPolygon[],
  side: 'left' | 'right',
): Point2D[] {
  const eyeId = side === 'left' ? 'leftEye' : 'rightEye'
  const underId = side === 'left' ? 'underEyeLeft' : 'underEyeRight'
  const eyePoly = polygons.find((p) => p.id === eyeId)
  const underPoly = polygons.find((p) => p.id === underId)

  // Eyeshadow ring is [upper arc…, lower arc…]; lower half = bottom edge.
  let eyeshadowLower =
    eyePoly && eyePoly.points.length >= 6
      ? eyePoly.points.slice(Math.floor(eyePoly.points.length / 2))
      : pointsFromIndices(
          landmarks,
          side === 'left' ? EYESHADOW_LOWER_LEFT : EYESHADOW_LOWER_RIGHT,
        )

  // Under-eye ring is [upper lid…, infra…]; upper half = top edge.
  let undereyeUpper =
    underPoly && underPoly.points.length >= 6
      ? underPoly.points.slice(0, Math.floor(underPoly.points.length / 2))
      : pointsFromIndices(
          landmarks,
          side === 'left' ? UNDEREYE_UPPER_LEFT : UNDEREYE_UPPER_RIGHT,
        )

  if (eyeshadowLower.length < 2 || undereyeUpper.length < 2) {
    return pointsFromIndices(
      landmarks,
      side === 'left' ? LEFT_EYE_OPENING : RIGHT_EYE_OPENING,
    )
  }

  // Ensure both edges run outer → inner so the closed ring doesn't bow-tie.
  eyeshadowLower = orderEyeEdgeOuterToInner(eyeshadowLower, side)
  undereyeUpper = orderEyeEdgeOuterToInner(undereyeUpper, side)

  return [...undereyeUpper, ...[...eyeshadowLower].reverse()]
}

/** Sort an eye edge so it runs from outer canthus toward the nose. */
function orderEyeEdgeOuterToInner(edge: Point2D[], side: 'left' | 'right'): Point2D[] {
  if (edge.length < 2) return edge
  const first = edge[0]
  const last = edge[edge.length - 1]
  // Mesh left eye (person's right) sits on the right side of the image (larger x = outer).
  const firstIsOuter =
    side === 'left' ? first.x >= last.x : first.x <= last.x
  return firstIsOuter ? edge : [...edge].reverse()
}

function punchPointsFromMask(
  mask: HTMLCanvasElement,
  points: Point2D[],
  width: number,
  height: number,
  expandNorm: number,
): void {
  const mctx = mask.getContext('2d')
  if (!mctx || points.length < 3) return
  let ring = points
  if (expandNorm !== 0) ring = expandRing(points, expandNorm)
  mctx.save()
  mctx.globalCompositeOperation = 'destination-out'
  mctx.fillStyle = '#fff'
  pathSmoothRing(mctx, ring, width, height)
  mctx.fill()
  mctx.restore()
}

function punchRingFromMask(
  mask: HTMLCanvasElement,
  landmarks: FaceLandmarkPoint[],
  indices: readonly number[],
  width: number,
  height: number,
  expandNorm: number,
): void {
  const mctx = mask.getContext('2d')
  if (!mctx) return
  mctx.save()
  mctx.globalCompositeOperation = 'destination-out'
  mctx.fillStyle = '#fff'
  punchSmoothRing(mctx, landmarks, indices, width, height, expandNorm)
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
