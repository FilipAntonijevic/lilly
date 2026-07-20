import type { LabColor, SkinDepth, Undertone } from '../types'

/** sRGB 0–255 → linear RGB 0–1 */
function srgbToLinear(c: number): number {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

/** Convert sRGB to CIE L*a*b* (D65). */
export function rgbToLab(r: number, g: number, b: number): LabColor {
  const R = srgbToLinear(r)
  const G = srgbToLinear(g)
  const B = srgbToLinear(b)

  let x = R * 0.4124564 + G * 0.3575761 + B * 0.1804375
  let y = R * 0.2126729 + G * 0.7151522 + B * 0.072175
  let z = R * 0.0193339 + G * 0.119192 + B * 0.9503041

  // D65 reference white
  x /= 0.95047
  y /= 1
  z /= 1.08883

  const f = (t: number) =>
    t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116

  const fx = f(x)
  const fy = f(y)
  const fz = f(z)

  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  }
}

export function labToRgb(lab: LabColor): [number, number, number] {
  const fy = (lab.L + 16) / 116
  const fx = lab.a / 500 + fy
  const fz = fy - lab.b / 200

  const fInv = (t: number) => {
    const t3 = t ** 3
    return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787
  }

  let x = 0.95047 * fInv(fx)
  let y = 1 * fInv(fy)
  let z = 1.08883 * fInv(fz)

  let r = x * 3.2404542 + y * -1.5371385 + z * -0.4985314
  let g = x * -0.969266 + y * 1.8760108 + z * 0.041556
  let b = x * 0.0556434 + y * -0.2040259 + z * 1.0572252

  const linearToSrgb = (c: number) => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
    return Math.max(0, Math.min(255, Math.round(v * 255)))
  }

  return [linearToSrgb(r), linearToSrgb(g), linearToSrgb(b)]
}

export function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
      .join('')
  )
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

export function hexToLab(hex: string): LabColor {
  const [r, g, b] = hexToRgb(hex)
  return rgbToLab(r, g, b)
}

/** ΔE76 — good enough for MVP shade ranking. */
export function deltaE76(a: LabColor, b: LabColor): number {
  return Math.hypot(a.L - b.L, a.a - b.a, a.b - b.b)
}

/**
 * Individual Typology Angle (Chardon et al.)
 * ITA = arctan((L* - 50) / b*) * (180/π)
 */
export function computeIta(lab: LabColor): number {
  const denom = lab.b === 0 ? 0.0001 : lab.b
  return (Math.atan((lab.L - 50) / denom) * 180) / Math.PI
}

export function itaToDepth(ita: number): SkinDepth {
  if (ita > 55) return 'very_light'
  if (ita > 41) return 'light'
  if (ita > 28) return 'medium'
  if (ita > 10) return 'tan'
  if (ita > -30) return 'deep'
  return 'very_deep'
}

export const DEPTH_ORDER: SkinDepth[] = [
  'very_light',
  'light',
  'medium',
  'tan',
  'deep',
  'very_deep',
]

export function depthIndex(d: SkinDepth): number {
  return DEPTH_ORDER.indexOf(d)
}

/**
 * Undertone from a* / b* balance.
 * Cool: higher a* (pink/red) relative to b*.
 * Warm: higher b* (yellow/gold).
 * Olive: low a* with moderate-high b* (greenish cast).
 */
export function classifyUndertone(lab: LabColor): {
  undertone: Undertone
  confidence: number
} {
  const { a, b } = lab
  const hueAngle = (Math.atan2(b, a) * 180) / Math.PI // degrees
  const chroma = Math.hypot(a, b)

  if (chroma < 6) {
    return { undertone: 'neutral', confidence: 0.45 }
  }

  // Olive: greenish-yellow zone with muted a*
  if (a < 8 && b > 12 && hueAngle > 70 && hueAngle < 120) {
    const confidence = Math.min(0.9, 0.55 + (12 - a) * 0.03)
    return { undertone: 'olive', confidence }
  }

  // Warm: yellow/gold dominant
  if (b > a + 2 && hueAngle > 35 && hueAngle < 100) {
    const confidence = Math.min(0.95, 0.55 + (b - a) * 0.04)
    return { undertone: 'warm', confidence }
  }

  // Cool: pink/red dominant
  if (a >= b - 1 && hueAngle > -20 && hueAngle < 55) {
    const confidence = Math.min(0.95, 0.55 + (a - b) * 0.04)
    return { undertone: 'cool', confidence }
  }

  return { undertone: 'neutral', confidence: 0.5 }
}

/** Rough YCbCr skin likelihood gate for sampling. */
export function isLikelySkinPixel(r: number, g: number, b: number): boolean {
  const y = 0.299 * r + 0.587 * g + 0.114 * b
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b
  return (
    y > 40 &&
    y < 240 &&
    cb > 77 &&
    cb < 127 &&
    cr > 133 &&
    cr < 173 &&
    r > 60 &&
    g > 30 &&
    b > 15 &&
    r > g &&
    r > b
  )
}
