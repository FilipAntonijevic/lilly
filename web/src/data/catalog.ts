import type { MakeupProduct } from '../types'
import { DEMO_CATALOG } from './demoCatalog'
import storeProducts from './products.json'

/** Pravi katalog prodavnice — trenutno prazan niz u products.json */
export function getStoreCatalog(): MakeupProduct[] {
  return storeProducts as MakeupProduct[]
}

/**
 * Aktivni katalog za matching:
 * - ako products.json ima stavke → koristi njih
 * - inače → demo katalog (za MVP prezentaciju)
 */
export function getActiveCatalog(): {
  products: MakeupProduct[]
  usingDemo: boolean
} {
  const store = getStoreCatalog()
  if (store.length > 0) {
    return { products: store, usingDemo: false }
  }
  return { products: DEMO_CATALOG, usingDemo: true }
}
