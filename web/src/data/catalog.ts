import type { MakeupProduct } from '../types'
import { DEMO_CATALOG } from './demoCatalog'

let cached: { products: MakeupProduct[]; usingDemo: boolean } | null = null
let loading: Promise<{ products: MakeupProduct[]; usingDemo: boolean }> | null =
  null

async function fetchStoreCatalog(): Promise<MakeupProduct[]> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}products.json`, {
      cache: 'no-cache',
    })
    if (!res.ok) return []
    const data = (await res.json()) as MakeupProduct[]
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

/**
 * Aktivni katalog za matching:
 * - products.json (dm.rs scrape) ako ima stavke
 * - inače demo katalog
 */
export async function loadActiveCatalog(): Promise<{
  products: MakeupProduct[]
  usingDemo: boolean
}> {
  if (cached) return cached
  if (!loading) {
    loading = (async () => {
      const store = await fetchStoreCatalog()
      cached =
        store.length > 0
          ? { products: store, usingDemo: false }
          : { products: DEMO_CATALOG, usingDemo: true }
      return cached
    })()
  }
  return loading
}
