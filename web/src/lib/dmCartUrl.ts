/** dm.rs checkout cart — products query uses article numbers (DAN). */
const DM_CART_BASE = 'https://www.dm.rs/checkout/cart'

function extractDanFromUrl(url?: string): string | undefined {
  if (!url) return undefined
  const match = url.match(/\/p\/d\/(\d+)/i)
  return match?.[1]
}

/**
 * Build a dm.rs cart link for the given products.
 * Uses DAN article numbers so the shop can resolve and add them.
 */
export function buildDmCartUrl(
  products: Array<{ dan?: string; url?: string }>,
): string {
  const dans = products
    .map((product) => product.dan?.trim() || extractDanFromUrl(product.url))
    .filter((dan): dan is string => Boolean(dan))

  const unique = [...new Set(dans)]
  if (unique.length === 0) return DM_CART_BASE

  const params = new URLSearchParams()
  params.set('products', unique.join(','))
  return `${DM_CART_BASE}?${params.toString()}`
}
