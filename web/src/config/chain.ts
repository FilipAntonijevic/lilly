export type ChainId = 'dm' | 'lilly'

/**
 * Default chain for local/dev and production builds.
 * Override at build time with VITE_CHAIN=lilly (or .env).
 */
const DEFAULT_CHAIN: ChainId = 'dm'

function resolveChain(): ChainId {
  const raw = (import.meta.env.VITE_CHAIN as string | undefined)?.trim().toLowerCase()
  if (raw === 'lilly' || raw === 'dm') return raw
  return DEFAULT_CHAIN
}

export const CHAIN: ChainId = resolveChain()

export interface ChainConfig {
  id: ChainId
  /** Hero / nav brand label */
  brandName: string
  documentTitle: string
  description: string
  /** Shown in “view on …” shop links */
  shopHost: string
  localeStorageKey: string
}

const CHAINS: Record<ChainId, ChainConfig> = {
  dm: {
    id: 'dm',
    brandName: 'dm',
    documentTitle: 'dm — Shade Match',
    description: 'dm — uslikaj lice i dobij preporuke šminke po tonu kože.',
    shopHost: 'dm.rs',
    localeStorageKey: 'dm.locale',
  },
  lilly: {
    id: 'lilly',
    brandName: 'Lilly',
    documentTitle: 'Lilly — Shade Match',
    description: 'Lilly — uslikaj lice i dobij preporuke šminke po tonu kože.',
    shopHost: 'lilly.rs',
    localeStorageKey: 'lilly.locale',
  },
}

export const chainConfig: ChainConfig = CHAINS[CHAIN]

export function applyChainDocumentMeta(): void {
  document.title = chainConfig.documentTitle
  const meta = document.querySelector('meta[name="description"]')
  if (meta) meta.setAttribute('content', chainConfig.description)
}
