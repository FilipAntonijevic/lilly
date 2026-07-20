import type { HairFamily, HairTemperature, LabColor, SkinProfile } from '../types'
import {
  classifyUndertone,
  computeIta,
  isLikelySkinPixel,
  itaToDepth,
  rgbToHex,
  rgbToLab,
} from './color'

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

/** Reject wall/background and skin so hair average isn't washed out. */
function isLikelyHairPixel(r: number, g: number, b: number): boolean {
  if (isLikelySkinPixel(r, g, b)) return false

  const lab = rgbToLab(r, g, b)
  const chroma = Math.hypot(lab.a, lab.b)

  // Near-white / ceiling / wall
  if (lab.L > 82 && chroma < 18) return false
  // Very bright low-chroma glare
  if (lab.L > 88) return false
  // Pure black noise / deep shadow voids — keep dark hair, drop empty bg
  if (lab.L < 6 && chroma < 4) return false

  return true
}

/**
 * Sample hair from several head regions; use median-darker pixels
 * so bright background doesn't pull the mean toward blonde.
 */
function sampleHair(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { lab: LabColor; rgb: [number, number, number]; count: number } {
  const regions = [
    // crown
    clampRegion({ x0: 0.3, y0: 0.02, x1: 0.7, y1: 0.14 }, width, height),
    // left temple / hairline
    clampRegion({ x0: 0.08, y0: 0.12, x1: 0.26, y1: 0.42 }, width, height),
    // right temple / hairline
    clampRegion({ x0: 0.74, y0: 0.12, x1: 0.92, y1: 0.42 }, width, height),
  ]

  const luminances: number[] = []
  const pixels: Array<[number, number, number]> = []

  for (const region of regions) {
    for (let y = region.y0; y < region.y1; y += 2) {
      for (let x = region.x0; x < region.x1; x += 2) {
        const i = (y * width + x) * 4
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        if (!isLikelyHairPixel(r, g, b)) continue
        const L = 0.2126 * r + 0.7152 * g + 0.0722 * b
        luminances.push(L)
        pixels.push([r, g, b])
      }
    }
  }

  if (!pixels.length) {
    return { lab: { L: 40, a: 8, b: 12 }, rgb: [90, 70, 55], count: 0 }
  }

  // Keep the darker 60% of candidates (hair), drop bright outliers (wall/highlights)
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
    // fallback: use all accepted hair pixels
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

function classifyHair(
  lab: LabColor,
  rgb: [number, number, number],
): { family: HairFamily; temperature: HairTemperature; hex: string } {
  const [r, g, b] = rgb
  const hex = rgbToHex(r, g, b)
  const chroma = Math.hypot(lab.a, lab.b)
  const warmYellow = lab.b > lab.a + 2

  let family: HairFamily = 'unknown'

  // Black / very dark brown
  if (lab.L < 20) {
    family = 'black'
  }
  // Red / auburn — strong red-yellow chroma
  else if (lab.a > 14 && lab.b > 12 && lab.a + lab.b > 32 && lab.L < 62) {
    family = 'red'
  }
  // Gray / ash — light but desaturated
  else if (lab.L > 48 && chroma < 10) {
    family = 'gray'
  }
  // Blonde — only truly light golden / pale hair (stricter than before)
  else if (lab.L >= 68 && chroma < 28 && warmYellow) {
    family = 'blonde'
  } else if (lab.L >= 72 && chroma < 22) {
    family = 'blonde'
  }
  // Light brown — what was incorrectly called blonde under bright light
  else if (lab.L >= 42 && lab.L < 68) {
    family = 'light_brown'
  }
  // Medium / dark brown
  else if (lab.L >= 20) {
    family = 'brown'
  }

  let temperature: HairTemperature = 'neutral'
  if (lab.b > lab.a + 3) temperature = 'warm'
  else if (lab.a >= lab.b + 1) temperature = 'cool'

  return { family, temperature, hex }
}

/**
 * Analyze a captured selfie canvas.
 * Uses cheek + forehead bands for skin and multi-region hair sampling.
 * MVP heuristic — no ML face mesh yet.
 */
export function analyzeCapturedImage(canvas: HTMLCanvasElement): SkinProfile {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable')
  }

  const { width, height } = canvas
  const { data } = ctx.getImageData(0, 0, width, height)

  // Mirror-selfie friendly cheek patches + forehead
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

  // Fallback: wider center oval without skin filter
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
  const ita = computeIta(lab)
  const depth = itaToDepth(ita)
  const { undertone, confidence } = classifyUndertone(lab)

  const hairSample = sampleHair(data, width, height)
  const hair = classifyHair(hairSample.lab, hairSample.rgb)

  return {
    lab,
    hex: rgbToHex(r, g, b),
    ita,
    depth,
    undertone,
    undertoneConfidence: confidence,
    hair,
    sampledPixels: total,
  }
}
