import type {
  MakeupProduct,
  ProductCategory,
  ProductMatch,
  SkinDepth,
  SkinProfile,
  Undertone,
} from '../types'
import { deltaE76, depthIndex, hexToLab } from './color'

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

  const { temperature, family } = skin.hair
  const tags = product.paletteTags.map((t) => t.toLowerCase())

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
  if (family === 'blonde' && tags.some((t) => ['peach', 'soft-pink', 'nude', 'champagne'].includes(t))) {
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
  // Map ΔE to 0–1 (smaller distance = better). ~25+ is a weak match.
  const deltaScore = Math.max(0, 1 - dE / 35)

  const isBase =
    product.category === 'foundation' || product.category === 'concealer'

  let score: number
  const reasons: string[] = []

  if (isBase) {
    score =
      undertone * FOUNDATION_WEIGHT.undertone +
      depth * FOUNDATION_WEIGHT.depth +
      deltaScore * FOUNDATION_WEIGHT.deltaE

    if (undertone >= 0.9) reasons.push('Isti undertone kao tvoja koža')
    else if (undertone >= 0.65) reasons.push('Kompatibilan undertone')
    if (depth >= 0.9) reasons.push('Poklapa se sa dubinom tena')
    if (deltaScore >= 0.7) reasons.push('Blizu izmerenoj boji kože')
  } else {
    const palette = paletteScore(product, skin)
    const hair = hairHarmony(product, skin)
    score =
      undertone * COLOR_PRODUCT_WEIGHT.undertone +
      palette * COLOR_PRODUCT_WEIGHT.palette +
      depth * COLOR_PRODUCT_WEIGHT.depth +
      hair * COLOR_PRODUCT_WEIGHT.hair

    if (palette >= 0.5) reasons.push('Color-theory paleta za tvoj undertone')
    if (hair >= 0.7) reasons.push('U skladu sa tonom kose')
    if (undertone >= 0.9) reasons.push('Isti undertone')
  }

  if (!reasons.length) reasons.push('Prihvatljiv match za MVP katalog')

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

export function categoryLabel(category: ProductCategory): string {
  const labels: Record<ProductCategory, string> = {
    foundation: 'Puder / foundation',
    concealer: 'Korektor',
    blush: 'Rumenilo',
    lipstick: 'Ruž',
    eyeshadow: 'Senka',
    bronzer: 'Bronzer',
  }
  return labels[category]
}
