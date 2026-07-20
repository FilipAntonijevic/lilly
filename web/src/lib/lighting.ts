import type { LightingInfo } from '../types'
import { isLikelySkinPixel, rgbToLab } from './color'
import { MAKEUP_REGIONS, type Landmark } from './faceLandmarker'

function srgbToLinear(c: number): number {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function linearToSrgb(c: number): number {
  const v = Math.max(0, Math.min(1, c))
  const s = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
  return Math.max(0, Math.min(255, Math.round(s * 255)))
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}

function isLikelySclera(r: number, g: number, b: number): boolean {
  const lab = rgbToLab(r, g, b)
  const chroma = Math.hypot(lab.a, lab.b)
  // Bright, low-chroma — eye white / specular highlight proxy for illuminant
  return lab.L > 62 && chroma < 16 && r > 140 && g > 140 && b > 140
}

function isNeutralBackground(r: number, g: number, b: number): boolean {
  if (isLikelySkinPixel(r, g, b)) return false
  const lab = rgbToLab(r, g, b)
  const chroma = Math.hypot(lab.a, lab.b)
  return lab.L > 45 && lab.L < 92 && chroma < 14
}

function sampleDiskMean(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
  predicate: (r: number, g: number, b: number) => boolean,
): [number, number, number] | null {
  let rSum = 0
  let gSum = 0
  let bSum = 0
  let count = 0
  const r2 = radius * radius
  const x0 = Math.max(0, Math.floor(cx - radius))
  const y0 = Math.max(0, Math.floor(cy - radius))
  const x1 = Math.min(width, Math.ceil(cx + radius))
  const y1 = Math.min(height, Math.ceil(cy + radius))

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > r2) continue
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
  if (count < 6) return null
  return [rSum / count, gSum / count, bSum / count]
}

/** Eye corner / lid landmarks useful for finding sclera near the iris. */
const SCLERA_ANCHORS = [33, 133, 160, 159, 158, 153, 144, 263, 362, 387, 386, 385, 380, 373]

function estimateIlluminantRgb(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  landmarks: Landmark[] | null,
): { rgb: [number, number, number]; source: LightingInfo['illuminantSource'] } {
  const samples: Array<[number, number, number]> = []

  if (landmarks) {
    const radius = Math.max(4, Math.round(Math.min(width, height) * 0.012))
    for (const idx of SCLERA_ANCHORS) {
      const lm = landmarks[idx]
      if (!lm) continue
      const sample = sampleDiskMean(
        data,
        width,
        height,
        lm.x * width,
        lm.y * height,
        radius,
        isLikelySclera,
      )
      if (sample) samples.push(sample)
    }

    // Neutral walls / background around cheekbones (outside face)
    for (const idx of [234, 454]) {
      const lm = landmarks[idx]
      if (!lm) continue
      const outward = idx === 234 ? -1 : 1
      const sample = sampleDiskMean(
        data,
        width,
        height,
        lm.x * width + outward * Math.min(width, height) * 0.06,
        lm.y * height,
        radius * 2.2,
        isNeutralBackground,
      )
      if (sample) samples.push(sample)
    }
  }

  // Global fallback: bright near-neutral pixels in the frame
  if (samples.length < 2) {
    for (let y = 0; y < height; y += 6) {
      for (let x = 0; x < width; x += 6) {
        const i = (y * width + x) * 4
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        if (isLikelySclera(r, g, b) || isNeutralBackground(r, g, b)) {
          samples.push([r, g, b])
        }
      }
    }
  }

  if (!samples.length) {
    return { rgb: [255, 255, 255], source: 'none' }
  }

  let rSum = 0
  let gSum = 0
  let bSum = 0
  for (const [r, g, b] of samples) {
    rSum += r
    gSum += g
    bSum += b
  }
  const n = samples.length
  const source: LightingInfo['illuminantSource'] =
    landmarks && samples.length >= 2 ? 'scene' : 'fallback'
  return { rgb: [rSum / n, gSum / n, bSum / n], source }
}

function meanCheekLuminance(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  landmarks: Landmark[] | null,
): number {
  const values: number[] = []
  const pushRegion = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y < y1; y += 2) {
      for (let x = x0; x < x1; x += 2) {
        const i = (y * width + x) * 4
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        if (!isLikelySkinPixel(r, g, b)) continue
        values.push(luminance(r, g, b))
      }
    }
  }

  if (landmarks) {
    const radius = Math.max(8, Math.round(Math.min(width, height) * 0.03))
    for (const idx of [...MAKEUP_REGIONS.leftCheek, ...MAKEUP_REGIONS.rightCheek]) {
      const lm = landmarks[idx]
      if (!lm) continue
      const cx = Math.round(lm.x * width)
      const cy = Math.round(lm.y * height)
      pushRegion(
        Math.max(0, cx - radius),
        Math.max(0, cy - radius),
        Math.min(width, cx + radius),
        Math.min(height, cy + radius),
      )
    }
  } else {
    pushRegion(
      Math.floor(width * 0.22),
      Math.floor(height * 0.38),
      Math.floor(width * 0.38),
      Math.floor(height * 0.58),
    )
    pushRegion(
      Math.floor(width * 0.62),
      Math.floor(height * 0.38),
      Math.floor(width * 0.78),
      Math.floor(height * 0.58),
    )
  }

  if (!values.length) return 0.25
  values.sort((a, b) => a - b)
  return values[Math.floor(values.length / 2)] ?? 0.25
}

function cheekLuminanceSpread(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  landmarks: Landmark[] | null,
): number {
  if (!landmarks) return 0
  const left: number[] = []
  const right: number[] = []
  const radius = Math.max(6, Math.round(Math.min(width, height) * 0.025))

  const collect = (indices: readonly number[], bucket: number[]) => {
    for (const idx of indices) {
      const lm = landmarks[idx]
      if (!lm) continue
      const sample = sampleDiskMean(
        data,
        width,
        height,
        lm.x * width,
        lm.y * height,
        radius,
        isLikelySkinPixel,
      )
      if (sample) bucket.push(luminance(sample[0], sample[1], sample[2]))
    }
  }

  collect(MAKEUP_REGIONS.leftCheek, left)
  collect(MAKEUP_REGIONS.rightCheek, right)
  if (!left.length || !right.length) return 0

  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  const l = avg(left)
  const r = avg(right)
  return Math.abs(l - r) / Math.max(l, r, 0.05)
}

/**
 * Flatten large-scale shading on the face (shadow vs sun side)
 * while keeping local chromaticity.
 */
function flattenFaceShading(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  landmarks: Landmark[] | null,
): void {
  if (!landmarks?.[10] || !landmarks[152] || !landmarks[234] || !landmarks[454]) {
    return
  }

  const minX = Math.max(0, Math.floor(Math.min(landmarks[234].x, landmarks[454].x) * width) - 8)
  const maxX = Math.min(width, Math.ceil(Math.max(landmarks[234].x, landmarks[454].x) * width) + 8)
  const minY = Math.max(0, Math.floor(landmarks[10].y * height) - 8)
  const maxY = Math.min(height, Math.ceil(landmarks[152].y * height) + 12)
  const bw = maxX - minX
  const bh = maxY - minY
  if (bw < 20 || bh < 20) return

  // Downsampled luminance grid
  const cell = 8
  const gw = Math.ceil(bw / cell)
  const gh = Math.ceil(bh / cell)
  const grid = new Float32Array(gw * gh)
  const counts = new Float32Array(gw * gh)

  for (let y = minY; y < maxY; y += 2) {
    for (let x = minX; x < maxX; x += 2) {
      const i = (y * width + x) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      if (!isLikelySkinPixel(r, g, b)) continue
      const gx = Math.min(gw - 1, Math.floor((x - minX) / cell))
      const gy = Math.min(gh - 1, Math.floor((y - minY) / cell))
      const gi = gy * gw + gx
      grid[gi] += luminance(r, g, b)
      counts[gi]++
    }
  }

  for (let i = 0; i < grid.length; i++) {
    grid[i] = counts[i] > 0 ? grid[i] / counts[i] : 0
  }

  // Fill empty cells from neighbors (simple)
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const i = y * gw + x
      if (grid[i] > 0) continue
      let sum = 0
      let n = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue
          const v = grid[ny * gw + nx]
          if (v > 0) {
            sum += v
            n++
          }
        }
      }
      if (n) grid[i] = sum / n
    }
  }

  let targetSum = 0
  let targetN = 0
  for (const v of grid) {
    if (v > 0) {
      targetSum += v
      targetN++
    }
  }
  const target = targetN ? targetSum / targetN : 0.3
  if (target < 0.05) return

  for (let y = minY; y < maxY; y++) {
    for (let x = minX; x < maxX; x++) {
      const i = (y * width + x) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      if (!isLikelySkinPixel(r, g, b)) continue

      const gx = Math.min(gw - 1, Math.floor((x - minX) / cell))
      const gy = Math.min(gh - 1, Math.floor((y - minY) / cell))
      const local = grid[gy * gw + gx]
      if (local < 0.04) continue

      // Blend correction so we don't fully erase natural contours
      const fullGain = target / local
      const gain = 1 + (Math.max(0.55, Math.min(1.85, fullGain)) - 1) * 0.72

      data[i] = linearToSrgb(srgbToLinear(r) * gain)
      data[i + 1] = linearToSrgb(srgbToLinear(g) * gain)
      data[i + 2] = linearToSrgb(srgbToLinear(b) * gain)
    }
  }
}

export interface LightingCorrectionResult {
  data: Uint8ClampedArray
  lighting: LightingInfo
}

/**
 * Correct color cast + exposure and flatten face shading before skin analysis.
 * Works on a copy — original canvas pixels stay untouched for the photo preview.
 */
export function correctLighting(
  input: Uint8ClampedArray,
  width: number,
  height: number,
  landmarks: Landmark[] | null,
): LightingCorrectionResult {
  const data = new Uint8ClampedArray(input)
  const { rgb: illum, source: illuminantSource } = estimateIlluminantRgb(
    data,
    width,
    height,
    landmarks,
  )

  const lr = Math.max(srgbToLinear(illum[0]), 0.02)
  const lg = Math.max(srgbToLinear(illum[1]), 0.02)
  const lb = Math.max(srgbToLinear(illum[2]), 0.02)
  // Von Kries–style channel gains toward equal-energy white
  const mean = (lr + lg + lb) / 3
  let gainR = mean / lr
  let gainG = mean / lg
  let gainB = mean / lb

  // Limit extreme WB (phone LEDs / heavy sunset)
  const clampGain = (g: number) => Math.max(0.55, Math.min(1.9, g))
  gainR = clampGain(gainR)
  gainG = clampGain(gainG)
  gainB = clampGain(gainB)

  for (let i = 0; i < data.length; i += 4) {
    data[i] = linearToSrgb(srgbToLinear(data[i]) * gainR)
    data[i + 1] = linearToSrgb(srgbToLinear(data[i + 1]) * gainG)
    data[i + 2] = linearToSrgb(srgbToLinear(data[i + 2]) * gainB)
  }

  // Exposure: map median cheek luminance toward a mid indoor reference
  const cheekY = meanCheekLuminance(data, width, height, landmarks)
  const TARGET_Y = 0.34
  let exposure = TARGET_Y / Math.max(cheekY, 0.04)
  exposure = Math.max(0.55, Math.min(2.4, exposure))

  if (Math.abs(exposure - 1) > 0.04) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = linearToSrgb(srgbToLinear(data[i]) * exposure)
      data[i + 1] = linearToSrgb(srgbToLinear(data[i + 1]) * exposure)
      data[i + 2] = linearToSrgb(srgbToLinear(data[i + 2]) * exposure)
    }
  }

  flattenFaceShading(data, width, height, landmarks)

  const spread = cheekLuminanceSpread(data, width, height, landmarks)
  const castStrength = Math.max(
    Math.abs(gainR - 1),
    Math.abs(gainG - 1),
    Math.abs(gainB - 1),
  )

  let quality: LightingInfo['quality'] = 'good'
  let note =
    'Svetlo je normalizovano (white balance + ekspozicija) radi stabilnijeg tona.'

  if (cheekY < 0.08 && exposure > 2.1) {
    quality = 'poor'
    note =
      'Previše tamno — rezultati mogu biti nestabilni. Probaj bliže prozoru / ravnomerno svetlo.'
  } else if (spread > 0.35 || castStrength > 0.55) {
    quality = 'fair'
    note =
      'Svetlo je korigovano, ali scena je nejednaka (senka/sunce). Za najbolji match koristi ravnomerno dnevno svetlo.'
  } else if (illuminantSource === 'none') {
    quality = 'fair'
    note =
      'Delimična korekcija svetla (nije nađen pouzdan referent). Najbolje pri prirodnom, ravnomernom svetlu.'
  }

  return {
    data,
    lighting: {
      corrected: illuminantSource !== 'none' || Math.abs(exposure - 1) > 0.05,
      quality,
      note,
      illuminantSource,
      exposureGain: exposure,
    },
  }
}
