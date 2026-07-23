import type { MakeupProduct } from '../types'
import { CHAIN } from '../config/chain'
import { DEMO_CATALOG } from './demoCatalog'
import { normalizeCatalog } from '../lib/normalizeCatalog'

let cached: { products: MakeupProduct[]; usingDemo: boolean } | null = null
let loading: Promise<{ products: MakeupProduct[]; usingDemo: boolean }> | null =
  null

async function importChainCatalog(): Promise<MakeupProduct[]> {
  if (CHAIN === 'lilly') {
    const mod = await import('./lilly/products.json')
    return (mod.default ?? mod) as MakeupProduct[]
  }
  const mod = await import('./dm/products.json')
  return (mod.default ?? mod) as MakeupProduct[]
}

/**
 * Active chain catalog as a bundled JSON chunk.
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
        const store = await importChainCatalog()
        cached =
          Array.isArray(store) && store.length > 0
            ? { products: normalizeCatalog(store), usingDemo: false }
            : { products: DEMO_CATALOG, usingDemo: true }
      } catch {
        cached = { products: DEMO_CATALOG, usingDemo: true }
      }
      return cached
    })()
  }
  return loading
}
