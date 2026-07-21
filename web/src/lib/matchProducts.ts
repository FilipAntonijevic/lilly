import type {
  MakeupProduct,
  ProductCategory,
  ProductMatch,
  SkinDepth,
  SkinProfile,
  Undertone,
} from '../types'
import type { MessageKey } from '../i18n/messages'
import { deltaE76, depthIndex, hexToLab } from './color'
import { lipstickTheoryBonus } from './lipstickTheory'

/**
 * Color-theory palette families by undertone.
 * Used when catalog tags products (blush/lipstick/eyeshadow).
 */
export const PALETTE_BY_UNDERTONE: Record<Undertone, string[]> = {
  cool: ['rose', 'berry', 'mauve', 'plum', 'blue-red', 'taupe', 'silver', 'cool-pink'],
  warm: ['peach', 'coral', 'terracotta', 'bronze', 'gold', 'copper', 'brick', 'warm-nude'],
  neutral: ['nude', 'soft-pink', 'rose-brown', 'champagne', 'soft-berry', 'bronze'],
  olive: ['muted-rose', 'terracotta', 'olive', 'bronze', 'soft-berry', 'caramel'],
}

const FOUNDATION_WEIGHT = {
  undertone: 45,
  depth: 35,
  deltaE: 20,
}

const COLOR_PRODUCT_WEIGHT = {
  undertone: 30,
  palette: 35,
  depth: 20,
  hair: 15,
}

function undertoneCompatible(skin: Undertone, product: Undertone): number {
  if (skin === product) return 1
  if (skin === 'neutral' || product === 'neutral') return 0.7
  if (skin === 'olive' && product === 'warm') return 0.65
  if (product === 'olive' && skin === 'warm') return 0.65
  return 0.15
}

function depthCompatible(
  skin: SkinDepth,
  min: SkinDepth,
  max: SkinDepth,
): number {
  const s = depthIndex(skin)
  const lo = depthIndex(min)
  const hi = depthIndex(max)
  if (s >= lo && s <= hi) return 1
  const dist = s < lo ? lo - s : s - hi
  return Math.max(0, 1 - dist * 0.35)
}

function paletteScore(product: MakeupProduct, skin: SkinProfile): number {
  const preferred = PALETTE_BY_UNDERTONE[skin.undertone]
  if (!product.paletteTags.length) return 0.4
  const hits = product.paletteTags.filter((t) =>
    preferred.includes(t.toLowerCase()),
  ).length
  return Math.min(1, hits / Math.max(1, Math.min(2, product.paletteTags.length)))
}

function hairHarmony(product: MakeupProduct, skin: SkinProfile): number {
  if (product.category === 'foundation' || product.category === 'concealer') {
    return 0.5
  }

  const { temperature, family, bald } = skin.hair
  const tags = product.paletteTags.map((t) => t.toLowerCase())

  if (bald || family === 'bald' || family === 'unknown') {
    return 0.5
  }

  let score = 0.5
  if (temperature === 'warm' && tags.some((t) => ['coral', 'peach', 'bronze', 'copper', 'gold', 'brick'].includes(t))) {
    score += 0.35
  }
  if (temperature === 'cool' && tags.some((t) => ['berry', 'mauve', 'plum', 'rose', 'silver', 'taupe'].includes(t))) {
    score += 0.35
  }
  if (family === 'red' && tags.some((t) => ['bronze', 'copper', 'warm-nude', 'terracotta'].includes(t))) {
    score += 0.15
  }
  if (
    (family === 'blonde' || family === 'light_brown') &&
    tags.some((t) => ['peach', 'soft-pink', 'nude', 'champagne'].includes(t))
  ) {
    score += 0.1
  }
  if (family === 'black' && tags.some((t) => ['plum', 'berry', 'brick', 'gold'].includes(t))) {
    score += 0.1
  }

  return Math.min(1, score)
}

function scoreProduct(product: MakeupProduct, skin: SkinProfile): ProductMatch {
  const undertone = undertoneCompatible(skin.undertone, product.undertone)
  const depth = depthCompatible(skin.depth, product.depthMin, product.depthMax)
  const dE = deltaE76(skin.lab, hexToLab(product.shadeHex))
  const deltaScore = Math.max(0, 1 - dE / 35)

  const isBase =
    product.category === 'foundation' || product.category === 'concealer'

  let score: number
  const reasons: MessageKey[] = []

  if (isBase) {
    score =
      undertone * FOUNDATION_WEIGHT.undertone +
      depth * FOUNDATION_WEIGHT.depth +
      deltaScore * FOUNDATION_WEIGHT.deltaE

    if (undertone >= 0.9) reasons.push('reason.sameUndertoneSkin')
    else if (undertone >= 0.65) reasons.push('reason.compatibleUndertone')
    if (depth >= 0.9) reasons.push('reason.depthMatch')
    if (deltaScore >= 0.7) reasons.push('reason.closeColor')
  } else {
    const palette = paletteScore(product, skin)
    const hair = hairHarmony(product, skin)
    score =
      undertone * COLOR_PRODUCT_WEIGHT.undertone +
      palette * COLOR_PRODUCT_WEIGHT.palette +
      depth * COLOR_PRODUCT_WEIGHT.depth +
      hair * COLOR_PRODUCT_WEIGHT.hair

    if (product.category === 'lipstick') {
      const lip = lipstickTheoryBonus(product, skin)
      score += lip.bonus
      reasons.push(...lip.reasonKeys)
    }

    if (palette >= 0.5) reasons.push('reason.palette')
    if (hair >= 0.7) reasons.push('reason.hairHarmony')
    if (undertone >= 0.9) reasons.push('reason.sameUndertone')
  }

  if (!reasons.length) reasons.push('reason.fallback')

  return { product, score, reasons }
}

const CATEGORY_ORDER: ProductCategory[] = [
  'foundation',
  'concealer',
  'blush',
  'lipstick',
  'eyeshadow',
  'bronzer',
]

/**
 * Rank products for a skin profile.
 * Returns top matches overall and best-per-category.
 * `reasons` are i18n message keys.
 */
export function matchProducts(
  catalog: MakeupProduct[],
  skin: SkinProfile,
  options?: { perCategory?: number; overallLimit?: number },
): {
  top: ProductMatch[]
  byCategory: Partial<Record<ProductCategory, ProductMatch[]>>
} {
  const perCategory = options?.perCategory ?? 2
  const overallLimit = options?.overallLimit ?? 8

  if (!catalog.length) {
    return { top: [], byCategory: {} }
  }

  const ranked = catalog
    .map((p) => scoreProduct(p, skin))
    .sort((a, b) => b.score - a.score)

  const byCategory: Partial<Record<ProductCategory, ProductMatch[]>> = {}
  for (const category of CATEGORY_ORDER) {
    byCategory[category] = ranked
      .filter((m) => m.product.category === category)
      .slice(0, perCategory)
  }

  return {
    top: ranked.slice(0, overallLimit),
    byCategory,
  }
}

export function categoryLabelKey(category: ProductCategory): MessageKey {
  return `category.${category}`
}
