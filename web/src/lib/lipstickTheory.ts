import type { MakeupProduct, SkinDepth, SkinProfile, Undertone } from '../types'
import { deltaE76, hexToLab } from './color'

/**
 * Lipstick color theory (Maybelline / L'Oréal / Clarins / Byrdie consensus):
 * - Do NOT pick lipstick by closeness to skin (that yields pointless nudes).
 * - Match lipstick undertone family to skin undertone.
 * - Cool → blue-red / cherry / berry / plum / mauve
 * - Warm → orange-red / brick / coral / peach / terracotta
 * - Neutral → true reds + either family
 * - Olive → muted brick / terracotta / soft berry (avoid icy pink)
 * - Prefer a real chromatic lip (esp. a flattering red) over skin-matching beige.
 */

export type LipColorFamily =
  | 'nude'
  | 'pink'
  | 'coral'
  | 'warm_red'
  | 'cool_red'
  | 'berry'
  | 'plum'
  | 'brown'
  | 'other'

export interface LipShadeProfile {
  family: LipColorFamily
  chroma: number
  /** Degrees, atan2(b, a) in Lab */
  hueDeg: number
  lab: { L: number; a: number; b: number }
  /** True classic red-ish statement shade */
  isStatementRed: boolean
}

/** Classify a lipstick swatch from its hex (ignore unreliable catalog tags). */
export function classifyLipShade(shadeHex: string): LipShadeProfile {
  const lab = hexToLab(shadeHex)
  const chroma = Math.hypot(lab.a, lab.b)
  const hueDeg = (Math.atan2(lab.b, lab.a) * 180) / Math.PI

  let family: LipColorFamily = 'other'

  if (chroma < 18 && lab.L > 45) {
    family = 'nude'
  } else if (chroma < 22 && lab.L < 45 && lab.a < 28) {
    family = 'brown'
  } else if (lab.a > 35 && chroma > 40 && hueDeg > -15 && hueDeg < 45) {
    // Strong reds: split warm (orange) vs cool (blue/berry lean)
    family = lab.b >= 12 ? 'warm_red' : 'cool_red'
  } else if (lab.a > 28 && lab.b > 18 && hueDeg > 20 && hueDeg < 55) {
    family = 'coral'
  } else if (lab.a > 22 && lab.b < 8 && hueDeg < 15) {
    family = lab.L < 40 || lab.a > 40 ? 'berry' : 'plum'
  } else if (lab.a > 15 && lab.b > -5 && lab.b < 22 && chroma < 40) {
    family = 'pink'
  } else if (lab.a > 25 && chroma > 30) {
    family = lab.b >= 10 ? 'warm_red' : 'cool_red'
  }

  const isStatementRed =
    (family === 'warm_red' || family === 'cool_red' || family === 'berry') &&
    chroma >= 35 &&
    lab.a >= 30

  return { family, chroma, hueDeg, lab, isStatementRed }
}

const PREFERRED_BY_UNDERTONE: Record<Undertone, LipColorFamily[]> = {
  cool: ['cool_red', 'berry', 'plum', 'pink', 'warm_red'],
  warm: ['warm_red', 'coral', 'brown', 'pink', 'cool_red'],
  neutral: ['cool_red', 'warm_red', 'berry', 'coral', 'pink'],
  olive: ['warm_red', 'coral', 'brown', 'berry', 'cool_red'],
}

/** Depth nudges which red intensity looks natural. */
function depthRedBias(depth: SkinDepth, family: LipColorFamily, L: number): number {
  const deep =
    depth === 'deep' || depth === 'very_deep' || depth === 'tan'
  const fair = depth === 'very_light' || depth === 'light'

  if (deep) {
    if (family === 'berry' || family === 'plum' || family === 'cool_red') return 8
    if (L > 55 && family === 'pink') return -6
    return 2
  }
  if (fair) {
    if (family === 'coral' || family === 'pink' || family === 'warm_red') return 6
    if (family === 'plum' && L < 30) return -4
    return 1
  }
  return 0
}

/**
 * Extra score for lipstick ranking on top of generic category score.
 * Higher = better. Designed so a flattering red beats a nude near skin.
 */
export function lipstickTheoryBonus(
  product: MakeupProduct,
  skin: SkinProfile,
): { bonus: number; reasonKeys: Array<'reason.lipstickRed' | 'reason.lipstickFamily' | 'reason.lipstickAvoidNude'> } {
  const shade = classifyLipShade(product.shadeHex)
  const preferred = PREFERRED_BY_UNDERTONE[skin.undertone]
  const familyRank = preferred.indexOf(shade.family)
  const reasons: Array<
    'reason.lipstickRed' | 'reason.lipstickFamily' | 'reason.lipstickAvoidNude'
  > = []

  let bonus = 0

  // Prefer chromatic lips over skin-matching beige.
  const dESkin = deltaE76(skin.lab, shade.lab)
  const tooCloseToSkin = dESkin < 18 && shade.chroma < 28
  if (tooCloseToSkin || shade.family === 'nude') {
    bonus -= 28
    reasons.push('reason.lipstickAvoidNude')
  } else if (shade.chroma < 22) {
    bonus -= 12
  } else {
    bonus += Math.min(18, (shade.chroma - 22) * 0.45)
  }

  // Undertone family match (color theory).
  if (familyRank === 0) {
    bonus += 26
    reasons.push('reason.lipstickFamily')
  } else if (familyRank === 1) {
    bonus += 18
    reasons.push('reason.lipstickFamily')
  } else if (familyRank === 2) {
    bonus += 10
  } else if (familyRank >= 3) {
    bonus += 4
  } else if (shade.family === 'nude') {
    bonus -= 8
  } else {
    bonus -= 10
  }

  // Explicit product undertone still matters a bit for tagged cool/warm.
  if (product.undertone === skin.undertone) bonus += 6
  else if (skin.undertone === 'neutral' || product.undertone === 'neutral') bonus += 2
  else if (
    (skin.undertone === 'olive' && product.undertone === 'warm') ||
    (skin.undertone === 'warm' && product.undertone === 'olive')
  ) {
    bonus += 3
  } else {
    bonus -= 8
  }

  // Statement red that fits the undertone — the “recommend a real red” rule.
  if (shade.isStatementRed) {
    const redOk =
      (skin.undertone === 'cool' &&
        (shade.family === 'cool_red' || shade.family === 'berry')) ||
      (skin.undertone === 'warm' &&
        (shade.family === 'warm_red' || shade.family === 'coral')) ||
      (skin.undertone === 'neutral' &&
        (shade.family === 'cool_red' ||
          shade.family === 'warm_red' ||
          shade.family === 'berry')) ||
      (skin.undertone === 'olive' &&
        (shade.family === 'warm_red' ||
          shade.family === 'coral' ||
          shade.family === 'berry'))
    if (redOk) {
      bonus += 22
      reasons.push('reason.lipstickRed')
    } else if (shade.family === 'warm_red' || shade.family === 'cool_red') {
      // Still a real red — far better than a skin-matching nude.
      bonus += 10
      reasons.push('reason.lipstickRed')
    }
  }

  bonus += depthRedBias(skin.depth, shade.family, shade.lab.L)

  // Hair temperature harmony (light touch).
  if (!skin.hair.bald) {
    if (
      skin.hair.temperature === 'cool' &&
      (shade.family === 'cool_red' || shade.family === 'berry' || shade.family === 'plum')
    ) {
      bonus += 5
    }
    if (
      skin.hair.temperature === 'warm' &&
      (shade.family === 'warm_red' || shade.family === 'coral' || shade.family === 'brown')
    ) {
      bonus += 5
    }
  }

  // Name hints when hex is ambiguous (Ruby Red, Coral, …).
  const name = `${product.name} ${product.shadeName ?? ''}`.toLowerCase()
  if (/(ruby|cherry|crimson|scarlet|crven|red\b|rosso)/u.test(name) && shade.chroma > 30) {
    bonus += 6
  }
  if (/(nude|beige|buff|naked)/u.test(name)) {
    bonus -= 10
  }

  return { bonus, reasonKeys: [...new Set(reasons)] }
}
