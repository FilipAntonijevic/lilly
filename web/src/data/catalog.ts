import type { MakeupProduct } from '../types'
import { DEMO_CATALOG } from './demoCatalog'

let cached: { products: MakeupProduct[]; usingDemo: boolean } | null = null
let loading: Promise<{ products: MakeupProduct[]; usingDemo: boolean }> | null =
  null

/**
 * DM katalog se učitava kao bundlovani JSON chunk (imageUrl, priceRsd, url uvek tu).
 * Ne zavisi od runtime fetch-a /products.json.
 */
export async function loadActiveCatalog(): Promise<{
  products: MakeupProduct[]
  usingDemo: boolean
}> {
  if (cached) return cached
  if (!loading) {
    loading = (async () => {
      try {
        const mod = await import('./products.json')
        const store = (mod.default ?? mod) as MakeupProduct[]
        cached =
          Array.isArray(store) && store.length > 0
            ? { products: store, usingDemo: false }
            : { products: DEMO_CATALOG, usingDemo: true }
      } catch {
        cached = { products: DEMO_CATALOG, usingDemo: true }
      }
      return cached
    })()
  }
  return loading
}
