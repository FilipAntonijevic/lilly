import { CHAIN } from '../config/chain'

/** dm.rs checkout cart — products query uses article numbers (DAN). */
const DM_CART_BASE = 'https://www.dm.rs/checkout/cart'

/**
 * Lilly Magento “add group by SKU” deep link.
 * Real browsers can open this; it adds the SKUs then shows the cart.
 */
const LILLY_CART_ADDGROUP = 'https://www.lilly.rs/checkout/cart/addgroup/skus'
const LILLY_CART_BASE = 'https://www.lilly.rs/checkout/cart'

function extractDanFromUrl(url?: string): string | undefined {
  if (!url) return undefined
  const match = url.match(/\/p\/d\/(\d+)/i)
  return match?.[1]
}

function extractLillySkuFromUrl(url?: string): string | undefined {
  if (!url) return undefined
  const match = url.match(/-(\d+)\/?$/)
  return match?.[1]
}

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

export function buildLillyCartUrl(
  products: Array<{ sku?: string; url?: string }>,
): string {
  const skus = products
    .map((product) => product.sku?.trim() || extractLillySkuFromUrl(product.url))
    .filter((sku): sku is string => Boolean(sku))

  const unique = [...new Set(skus)]
  if (unique.length === 0) return LILLY_CART_BASE
  return `${LILLY_CART_ADDGROUP}/${unique.join(',')}`
}

/** Cart / “view in shop” URL for the active chain. */
export function buildShopCartUrl(
  products: Array<{ dan?: string; sku?: string; url?: string }>,
): string {
  return CHAIN === 'lilly' ? buildLillyCartUrl(products) : buildDmCartUrl(products)
}
