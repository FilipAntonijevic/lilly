import type { MakeupProduct } from '../types'

/** Strip trailing shade segment: "… puder — 100" → "… puder" */
export function productBaseName(name: string): string {
  return name.replace(/\s*[—–-]\s*.+$/u, '').replace(/\s+/g, ' ').trim()
}

/** Group key for shade siblings of the same retail product line. */
export function shadeFamilyKey(product: MakeupProduct): string {
  return [
    product.brand.trim().toLowerCase(),
    product.category,
    productBaseName(product.name).toLowerCase(),
  ].join('|')
}

function shadeSortValue(product: MakeupProduct): number {
  const fromName = Number.parseFloat(String(product.shadeName ?? '').replace(',', '.'))
  if (!Number.isNaN(fromName)) return fromName
  // Fall back to perceived lightness of the swatch
  const hex = product.shadeHex.replace('#', '')
  if (hex.length < 6) return 0
  const r = Number.parseInt(hex.slice(0, 2), 16)
  const g = Number.parseInt(hex.slice(2, 4), 16)
  const b = Number.parseInt(hex.slice(4, 6), 16)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * All catalog shades that belong to the same product line as `product`
 * (same brand + category + base name), sorted light→deep-ish.
 */
export function findShadeVariants(
  product: MakeupProduct,
  catalog: MakeupProduct[],
): MakeupProduct[] {
  const key = shadeFamilyKey(product)
  const variants = catalog.filter((p) => shadeFamilyKey(p) === key)
  if (!variants.length) return [product]

  const byId = new Map(variants.map((p) => [p.id, p]))
  if (!byId.has(product.id)) byId.set(product.id, product)

  return [...byId.values()].sort((a, b) => {
    const d = shadeSortValue(a) - shadeSortValue(b)
    if (d !== 0) return d
    return a.id.localeCompare(b.id)
  })
}

/**
 * One representative product per retail line in a category (for pickers).
 * Prefers the first shade in light→deep order as the line card.
 */
export function listProductLines(
  catalog: MakeupProduct[],
  category: MakeupProduct['category'],
): MakeupProduct[] {
  const seen = new Map<string, MakeupProduct>()
  for (const product of catalog) {
    if (product.category !== category) continue
    const key = shadeFamilyKey(product)
    const existing = seen.get(key)
    if (!existing) {
      seen.set(key, product)
      continue
    }
    // Keep the lighter / earlier shade as the line representative.
    if (shadeSortValue(product) < shadeSortValue(existing)) {
      seen.set(key, product)
    }
  }
  return [...seen.values()].sort((a, b) => {
    const brand = a.brand.localeCompare(b.brand)
    if (brand !== 0) return brand
    return productBaseName(a.name).localeCompare(productBaseName(b.name))
  })
}
