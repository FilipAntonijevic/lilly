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

function classifyHair(
  lab: LabColor,
  rgb: [number, number, number],
): { family: HairFamily; temperature: HairTemperature; hex: string } {
  const [r, g, b] = rgb
  const hex = rgbToHex(r, g, b)
  const chroma = Math.hypot(lab.a, lab.b)

  let family: HairFamily = 'unknown'
  if (lab.L > 55 && chroma < 25) family = 'blonde'
  else if (lab.L < 22) family = 'black'
  else if (lab.L > 35 && lab.a > 12 && lab.b > 10 && lab.a + lab.b > 28) family = 'red'
  else if (lab.L > 40 && chroma < 12) family = 'gray'
  else if (lab.L >= 22) family = 'brown'

  let temperature: HairTemperature = 'neutral'
  if (lab.b > lab.a + 3) temperature = 'warm'
  else if (lab.a >= lab.b) temperature = 'cool'

  return { family, temperature, hex }
}

/**
 * Analyze a captured selfie canvas.
 * Uses cheek + forehead bands for skin and a top band for hair.
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

  const hairRegion = clampRegion(
    { x0: 0.28, y0: 0.02, x1: 0.72, y1: 0.16 },
    width,
    height,
  )
  const hairSample = sampleMeanLab(data, width, hairRegion, false)
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
