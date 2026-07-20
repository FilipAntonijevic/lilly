import type {
  FaceRegionSample,
  HairFamily,
  HairTemperature,
  LabColor,
  SkinProfile,
} from '../types'
import {
  classifyUndertone,
  computeIta,
  isLikelySkinPixel,
  rgbToHex,
  rgbToLab,
} from './color'
import {
  MAKEUP_REGIONS,
  detectFaceLandmarks,
  type Landmark,
  type MakeupRegionKey,
} from './faceLandmarker'
import {
  itaToFitzpatrick,
  resolveDepthFromItaAndFitzpatrick,
} from './fitzpatrick'
import { correctLighting } from './lighting'
import type { LightingInfo } from '../types'

interface SampleRegion {
  x0: number
  y0: number
  x1: number
  y1: number
}

function clampRegion(
  region: SampleRegion,
  width: number,
  height: number,
): SampleRegion {
  return {
    x0: Math.max(0, Math.floor(region.x0 * width)),
    y0: Math.max(0, Math.floor(region.y0 * height)),
    x1: Math.min(width, Math.ceil(region.x1 * width)),
    y1: Math.min(height, Math.ceil(region.y1 * height)),
  }
}

function sampleMeanLab(
  data: Uint8ClampedArray,
  width: number,
  region: SampleRegion,
  filterSkin: boolean,
): { lab: LabColor; rgb: [number, number, number]; count: number } {
  let rSum = 0
  let gSum = 0
  let bSum = 0
  let count = 0

  for (let y = region.y0; y < region.y1; y += 2) {
    for (let x = region.x0; x < region.x1; x += 2) {
      const i = (y * width + x) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      if (filterSkin && !isLikelySkinPixel(r, g, b)) continue
      rSum += r
      gSum += g
      bSum += b
      count++
    }
  }

  if (count === 0) {
    return { lab: { L: 60, a: 10, b: 15 }, rgb: [180, 140, 120], count: 0 }
  }

  const r = rSum / count
  const g = gSum / count
  const b = bSum / count
  return { lab: rgbToLab(r, g, b), rgb: [r, g, b], count }
}

function isLikelyHairPixel(r: number, g: number, b: number): boolean {
  if (isLikelySkinPixel(r, g, b)) return false
  const lab = rgbToLab(r, g, b)
  const chroma = Math.hypot(lab.a, lab.b)
  if (lab.L > 82 && chroma < 18) return false
  if (lab.L > 88) return false
  if (lab.L < 6 && chroma < 4) return false
  return true
}

function sampleDisk(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
  predicate: (r: number, g: number, b: number) => boolean,
): { lab: LabColor; rgb: [number, number, number]; count: number } {
  const x0 = Math.max(0, Math.floor(cx - radius))
  const y0 = Math.max(0, Math.floor(cy - radius))
  const x1 = Math.min(width, Math.ceil(cx + radius))
  const y1 = Math.min(height, Math.ceil(cy + radius))
  const r2 = radius * radius

  let rSum = 0
  let gSum = 0
  let bSum = 0
  let count = 0

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const dx = x - cx
      const dy = y - cy
      if (dx * dx + dy * dy > r2) continue
      const i = (y * width + x) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      if (!predicate(r, g, b)) continue
      rSum += r
      gSum += g
      bSum += b
      count++
    }
  }

  if (!count) {
    return { lab: { L: 60, a: 10, b: 15 }, rgb: [180, 140, 120], count: 0 }
  }

  const r = rSum / count
  const g = gSum / count
  const b = bSum / count
  return { lab: rgbToLab(r, g, b), rgb: [r, g, b], count }
}

function sampleLandmarkCluster(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  landmarks: Landmark[],
  indices: readonly number[],
  radiusPx: number,
  predicate: (r: number, g: number, b: number) => boolean,
): { lab: LabColor; rgb: [number, number, number]; count: number } {
  let rSum = 0
  let gSum = 0
  let bSum = 0
  let count = 0

  for (const idx of indices) {
    const lm = landmarks[idx]
    if (!lm) continue
    const sample = sampleDisk(
      data,
      width,
      height,
      lm.x * width,
      lm.y * height,
      radiusPx,
      predicate,
    )
    if (!sample.count) continue
    rSum += sample.rgb[0] * sample.count
    gSum += sample.rgb[1] * sample.count
    bSum += sample.rgb[2] * sample.count
    count += sample.count
  }

  if (!count) {
    return { lab: { L: 60, a: 10, b: 15 }, rgb: [180, 140, 120], count: 0 }
  }

  const r = rSum / count
  const g = gSum / count
  const b = bSum / count
  return { lab: rgbToLab(r, g, b), rgb: [r, g, b], count }
}

/** Sample hair above the detected hairline landmarks. */
function sampleHairFromLandmarks(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  landmarks: Landmark[],
): { lab: LabColor; rgb: [number, number, number]; count: number } {
  const luminances: number[] = []
  const pixels: Array<[number, number, number]> = []
  const radius = Math.max(10, Math.round(Math.min(width, height) * 0.035))

  for (const idx of MAKEUP_REGIONS.hairline) {
    const lm = landmarks[idx]
    if (!lm) continue
    const cx = lm.x * width
    // Move upward from hairline into hair (y grows downward)
    const cy = Math.max(0, lm.y * height - radius * 1.6)

    for (let y = Math.max(0, Math.floor(cy - radius)); y < Math.min(height, cy + radius); y++) {
      for (let x = Math.max(0, Math.floor(cx - radius)); x < Math.min(width, cx + radius); x++) {
        const dx = x - cx
        const dy = y - cy
        if (dx * dx + dy * dy > radius * radius) continue
        const i = (y * width + x) * 4
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        if (!isLikelyHairPixel(r, g, b)) continue
        luminances.push(0.2126 * r + 0.7152 * g + 0.0722 * b)
        pixels.push([r, g, b])
      }
    }
  }

  // Temples as backup hair anchors
  for (const idx of [234, 454, 127, 356]) {
    const lm = landmarks[idx]
    if (!lm) continue
    const cx = lm.x * width
    const cy = lm.y * height
    const outward = idx === 234 || idx === 127 ? -1 : 1
    const hx = cx + outward * radius * 0.9
    const sample = sampleDisk(data, width, height, hx, cy, radius, isLikelyHairPixel)
    if (!sample.count) continue
    for (let n = 0; n < sample.count; n++) {
      luminances.push(0.2126 * sample.rgb[0] + 0.7152 * sample.rgb[1] + 0.0722 * sample.rgb[2])
      pixels.push([sample.rgb[0], sample.rgb[1], sample.rgb[2]])
    }
  }

  if (!pixels.length) {
    return { lab: { L: 40, a: 8, b: 12 }, rgb: [90, 70, 55], count: 0 }
  }

  const sorted = [...luminances].sort((a, b) => a - b)
  const cutoff = sorted[Math.floor(sorted.length * 0.6)] ?? sorted[sorted.length - 1]

  let rSum = 0
  let gSum = 0
  let bSum = 0
  let count = 0
  for (let i = 0; i < pixels.length; i++) {
    if (luminances[i] > cutoff) continue
    rSum += pixels[i][0]
    gSum += pixels[i][1]
    bSum += pixels[i][2]
    count++
  }

  if (count < 12) {
    rSum = 0
    gSum = 0
    bSum = 0
    count = 0
    for (const [r, g, b] of pixels) {
      rSum += r
      gSum += g
      bSum += b
      count++
    }
  }

  const r = rSum / count
  const g = gSum / count
  const b = bSum / count
  return { lab: rgbToLab(r, g, b), rgb: [r, g, b], count }
}

function classifyHairHeuristic(
  lab: LabColor,
  rgb: [number, number, number],
  hairPixelCount: number,
  expectedHairPixels: number,
): SkinProfile['hair'] {
  const hex = rgbToHex(rgb[0], rgb[1], rgb[2])
  const chroma = Math.hypot(lab.a, lab.b)
  const warmYellow = lab.b > lab.a + 2
  const sparseHair =
    expectedHairPixels > 0 && hairPixelCount < expectedHairPixels * 0.12

  if (sparseHair) {
    return {
      family: 'bald',
      temperature: 'neutral',
      hex: '#c4a484',
      bald: true,
      confidence: 0.55,
      source: 'heuristic',
    }
  }

  let family: HairFamily = 'unknown'
  if (lab.L < 20) family = 'black'
  else if (lab.a > 14 && lab.b > 12 && lab.a + lab.b > 32 && lab.L < 62) family = 'red'
  else if (lab.L > 48 && chroma < 10) family = 'gray'
  else if (lab.L >= 68 && chroma < 28 && warmYellow) family = 'blonde'
  else if (lab.L >= 72 && chroma < 22) family = 'blonde'
  else if (lab.L >= 42 && lab.L < 68) family = 'light_brown'
  else if (lab.L >= 20) family = 'brown'

  let temperature: HairTemperature = 'neutral'
  if (lab.b > lab.a + 3) temperature = 'warm'
  else if (lab.a >= lab.b + 1) temperature = 'cool'

  return {
    family,
    temperature,
    hex,
    bald: false,
    confidence: hairPixelCount > 40 ? 0.5 : 0.3,
    source: 'heuristic',
  }
}

function expectedHairSampleBudget(width: number, height: number): number {
  const radius = Math.max(10, Math.round(Math.min(width, height) * 0.035))
  // ~hairline landmarks × disk area (rough upper bound)
  return MAKEUP_REGIONS.hairline.length * Math.PI * radius * radius * 0.35
}

function withSkinMetrics(
  lab: LabColor,
  rgb: [number, number, number],
  undertone: SkinProfile['undertone'],
  confidence: number,
  hair: SkinProfile['hair'],
  sampledPixels: number,
  usedFaceMesh: boolean,
  regions: FaceRegionSample[],
  lighting: LightingInfo,
): SkinProfile {
  const ita = computeIta(lab)
  const fitzpatrick = itaToFitzpatrick(ita)
  return {
    lab,
    hex: rgbToHex(rgb[0], rgb[1], rgb[2]),
    ita,
    depth: resolveDepthFromItaAndFitzpatrick(ita, fitzpatrick),
    fitzpatrick,
    fitzpatrickSource: 'ita',
    undertone,
    undertoneConfidence: confidence,
    hair,
    sampledPixels,
    usedFaceMesh,
    regions,
    lighting,
  }
}

const REGION_META: Record<
  Exclude<MakeupRegionKey, 'hairline' | 'underEyeLeft' | 'underEyeRight'>,
  { id: FaceRegionSample['id']; label: string }
> = {
  forehead: { id: 'forehead', label: 'Čelo' },
  leftCheek: { id: 'leftCheek', label: 'Leva jagodica' },
  rightCheek: { id: 'rightCheek', label: 'Desna jagodica' },
  jaw: { id: 'jaw', label: 'Vilica / vrat' },
}

function toRegionSample(
  id: FaceRegionSample['id'],
  label: string,
  sample: { lab: LabColor; rgb: [number, number, number]; count: number },
): FaceRegionSample {
  return {
    id,
    label,
    hex: rgbToHex(sample.rgb[0], sample.rgb[1], sample.rgb[2]),
    lab: sample.lab,
    pixelCount: sample.count,
  }
}

function analyzeWithLandmarks(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  landmarks: Landmark[],
  lighting: LightingInfo,
): SkinProfile {
  const radius = Math.max(8, Math.round(Math.min(width, height) * 0.028))
  const skinPred = (r: number, g: number, b: number) => isLikelySkinPixel(r, g, b)

  const forehead = sampleLandmarkCluster(
    data,
    width,
    height,
    landmarks,
    MAKEUP_REGIONS.forehead,
    radius,
    skinPred,
  )
  const leftCheek = sampleLandmarkCluster(
    data,
    width,
    height,
    landmarks,
    MAKEUP_REGIONS.leftCheek,
    radius,
    skinPred,
  )
  const rightCheek = sampleLandmarkCluster(
    data,
    width,
    height,
    landmarks,
    MAKEUP_REGIONS.rightCheek,
    radius,
    skinPred,
  )
  const jaw = sampleLandmarkCluster(
    data,
    width,
    height,
    landmarks,
    MAKEUP_REGIONS.jaw,
    radius,
    skinPred,
  )
  const underEyeLeft = sampleLandmarkCluster(
    data,
    width,
    height,
    landmarks,
    MAKEUP_REGIONS.underEyeLeft,
    Math.round(radius * 0.75),
    skinPred,
  )
  const underEyeRight = sampleLandmarkCluster(
    data,
    width,
    height,
    landmarks,
    MAKEUP_REGIONS.underEyeRight,
    Math.round(radius * 0.75),
    skinPred,
  )

  // Foundation / undertone: cheeks + jaw (most stable for makeup match)
  const foundationZones = [leftCheek, rightCheek, jaw].filter((z) => z.count > 0)
  const zones =
    foundationZones.length > 0
      ? foundationZones
      : [forehead, leftCheek, rightCheek, jaw].filter((z) => z.count > 0)

  let rSum = 0
  let gSum = 0
  let bSum = 0
  let total = 0
  for (const z of zones) {
    rSum += z.rgb[0] * z.count
    gSum += z.rgb[1] * z.count
    bSum += z.rgb[2] * z.count
    total += z.count
  }

  if (total < 20) {
    throw new Error('Too few skin pixels in face regions')
  }

  const r = rSum / total
  const g = gSum / total
  const b = bSum / total
  const lab = rgbToLab(r, g, b)
  const { undertone, confidence } = classifyUndertone(lab)

  const hairSample = sampleHairFromLandmarks(data, width, height, landmarks)
  const hair = classifyHairHeuristic(
    hairSample.lab,
    hairSample.rgb,
    hairSample.count,
    expectedHairSampleBudget(width, height),
  )

  const underEyeCount = underEyeLeft.count + underEyeRight.count
  const underEye =
    underEyeCount > 0
      ? {
          lab: rgbToLab(
            (underEyeLeft.rgb[0] * underEyeLeft.count +
              underEyeRight.rgb[0] * underEyeRight.count) /
              underEyeCount,
            (underEyeLeft.rgb[1] * underEyeLeft.count +
              underEyeRight.rgb[1] * underEyeRight.count) /
              underEyeCount,
            (underEyeLeft.rgb[2] * underEyeLeft.count +
              underEyeRight.rgb[2] * underEyeRight.count) /
              underEyeCount,
          ),
          rgb: [
            (underEyeLeft.rgb[0] * underEyeLeft.count +
              underEyeRight.rgb[0] * underEyeRight.count) /
              underEyeCount,
            (underEyeLeft.rgb[1] * underEyeLeft.count +
              underEyeRight.rgb[1] * underEyeRight.count) /
              underEyeCount,
            (underEyeLeft.rgb[2] * underEyeLeft.count +
              underEyeRight.rgb[2] * underEyeRight.count) /
              underEyeCount,
          ] as [number, number, number],
          count: underEyeCount,
        }
      : null

  const regions: FaceRegionSample[] = [
    toRegionSample('forehead', REGION_META.forehead.label, forehead),
    toRegionSample('leftCheek', REGION_META.leftCheek.label, leftCheek),
    toRegionSample('rightCheek', REGION_META.rightCheek.label, rightCheek),
    toRegionSample('jaw', REGION_META.jaw.label, jaw),
  ]
  if (underEye) {
    regions.push(toRegionSample('underEye', 'Ispod očiju', underEye))
  }
  regions.push(
    toRegionSample('hair', hair.bald ? 'Kosa (celavo)' : 'Kosa', {
      lab: hairSample.lab,
      rgb: hairSample.rgb,
      count: hairSample.count,
    }),
  )

  return withSkinMetrics(
    lab,
    [r, g, b],
    undertone,
    confidence,
    hair,
    total,
    true,
    regions.filter((region) => region.pixelCount > 0),
    lighting,
  )
}

/** Heuristic fallback when Face Landmarker cannot find a face. */
function analyzeHeuristic(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  lighting: LightingInfo,
): SkinProfile {
  const regions = [
    clampRegion({ x0: 0.22, y0: 0.38, x1: 0.38, y1: 0.58 }, width, height),
    clampRegion({ x0: 0.62, y0: 0.38, x1: 0.78, y1: 0.58 }, width, height),
    clampRegion({ x0: 0.38, y0: 0.22, x1: 0.62, y1: 0.36 }, width, height),
  ]

  let rSum = 0
  let gSum = 0
  let bSum = 0
  let total = 0

  for (const region of regions) {
    const sample = sampleMeanLab(data, width, region, true)
    if (sample.count === 0) continue
    rSum += sample.rgb[0] * sample.count
    gSum += sample.rgb[1] * sample.count
    bSum += sample.rgb[2] * sample.count
    total += sample.count
  }

  if (total < 40) {
    const fallback = clampRegion(
      { x0: 0.3, y0: 0.28, x1: 0.7, y1: 0.65 },
      width,
      height,
    )
    const sample = sampleMeanLab(data, width, fallback, false)
    rSum = sample.rgb[0] * sample.count
    gSum = sample.rgb[1] * sample.count
    bSum = sample.rgb[2] * sample.count
    total = sample.count
  }

  const r = rSum / Math.max(total, 1)
  const g = gSum / Math.max(total, 1)
  const b = bSum / Math.max(total, 1)
  const lab = rgbToLab(r, g, b)
  const { undertone, confidence } = classifyUndertone(lab)

  const hairRegion = clampRegion(
    { x0: 0.28, y0: 0.02, x1: 0.72, y1: 0.14 },
    width,
    height,
  )
  const hairSample = sampleMeanLab(data, width, hairRegion, false)
  const hair = classifyHairHeuristic(
    hairSample.lab,
    hairSample.rgb,
    hairSample.count,
    expectedHairSampleBudget(width, height),
  )

  return withSkinMetrics(
    lab,
    [r, g, b],
    undertone,
    confidence,
    hair,
    total,
    false,
    [],
    lighting,
  )
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise.then((value) => value as T | null),
    new Promise<null>((resolve) => {
      window.setTimeout(() => resolve(null), ms)
    }),
  ])
}

/**
 * Analyze a captured selfie with MediaPipe Face Landmarker when possible.
 * Samples makeup-relevant regions: cheeks, forehead, jaw, under-eye, hairline.
 * Lighting is normalized first so shade/sun selfies are closer.
 * Hair uses a cheap Lab/bald heuristic only (no ML) — least important for matching.
 * Fitzpatrick from ITA (Fitzpatrick17k thresholds).
 */
export async function analyzeCapturedImage(
  canvas: HTMLCanvasElement,
): Promise<SkinProfile> {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable')
  }

  const { width, height } = canvas
  const { data: raw } = ctx.getImageData(0, 0, width, height)

  // Face Landmarker first load can be slow on mobile — fail fast to heuristic.
  let landmarks: Landmark[] | null = null
  try {
    landmarks = await withTimeout(detectFaceLandmarks(canvas), 2500)
  } catch {
    landmarks = null
  }

  const { data, lighting } = correctLighting(raw, width, height, landmarks)

  if (landmarks) {
    try {
      return analyzeWithLandmarks(data, width, height, landmarks, lighting)
    } catch {
      return analyzeHeuristic(data, width, height, lighting)
    }
  }

  return analyzeHeuristic(data, width, height, lighting)
}
