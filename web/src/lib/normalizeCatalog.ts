import type { MakeupProduct, ProductCategory } from '../types'

/**
 * Fix obvious scraper misfires (e.g. "Blushed Stardust" eyeshadow → blush
 * because the shade name contains "blush").
 */
export function normalizeProductCategory(
  product: MakeupProduct,
): MakeupProduct {
  const fixed = inferCategoryFromName(product.name)
  if (!fixed || fixed === product.category) return product
  return { ...product, category: fixed }
}

export function normalizeCatalog(
  products: MakeupProduct[],
): MakeupProduct[] {
  return products.map(normalizeProductCategory)
}

function inferCategoryFromName(name: string): ProductCategory | null {
  const hay = name.toLowerCase()
  if (
    /senka\s+za\s+oč/.test(hay) ||
    /eyeshadow/.test(hay) ||
    /paleta\s+senki/.test(hay)
  ) {
    return 'eyeshadow'
  }
  if (/sjaj\s+za\s+usne|lip\s*gloss|karmin|ruž\s+za\s+usne|lipstick/.test(hay)) {
    return 'lipstick'
  }
  if (/korektor|concealer/.test(hay)) return 'concealer'
  if (/bronzer|kontur|contour/.test(hay)) return 'bronzer'
  if (/rumenilo|(^|[^a-z])blush([^a-z]|$)/.test(hay)) return 'blush'
  if (/foundation|tečni\s+puder|tečni puder|bb\s+krem|cc\s+krem/.test(hay)) {
    return 'foundation'
  }
  return null
}
