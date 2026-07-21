import { useMemo, useState } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import { listProductLines, productBaseName, shadeFamilyKey } from '../lib/shadeFamilies'
import type { MakeupProduct, ProductCategory } from '../types'

interface TryOnProductPickerProps {
  category: ProductCategory
  catalog: MakeupProduct[]
  selectedId: string | null
  selectedLineKey?: string | null
  onPick: (product: MakeupProduct) => void
  onClose: () => void
}

function formatPriceRsd(
  price: number | undefined,
  unavailable: string,
  locale: string,
): string {
  if (typeof price !== 'number' || Number.isNaN(price)) return unavailable
  return (
    new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'sr-RS', {
      maximumFractionDigits: 0,
    }).format(price) + ' RSD'
  )
}

function optimizeImageUrl(url?: string): string | undefined {
  if (!url) return undefined
  return url.replace(/h_320,w_320/g, 'h_480,w_480')
}

export function TryOnProductPicker({
  category,
  catalog,
  selectedId,
  selectedLineKey,
  onPick,
  onClose,
}: TryOnProductPickerProps) {
  const { locale, t } = useLanguage()
  const [query, setQuery] = useState('')

  const lines = useMemo(
    () => listProductLines(catalog, category),
    [catalog, category],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return lines
    return lines.filter((p) => {
      const hay = `${p.brand} ${productBaseName(p.name)} ${p.shadeName ?? ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [lines, query])

  return (
    <div className="tryon-picker-backdrop" role="presentation" onClick={onClose}>
      <div
        className="tryon-picker"
        role="dialog"
        aria-modal="true"
        aria-label={t('tryon.pickTitle')}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="tryon-picker-top">
          <h3>{t('tryon.pickTitle')}</h3>
          <button type="button" className="tryon-chip" onClick={onClose}>
            {t('tryon.pickClose')}
          </button>
        </header>

        <input
          type="search"
          className="tryon-picker-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('tryon.pickSearch')}
          aria-label={t('tryon.pickSearch')}
        />

        <ul className="tryon-picker-list">
          {filtered.map((product) => {
            const active =
              product.id === selectedId ||
              (selectedLineKey != null &&
                shadeFamilyKey(product) === selectedLineKey)
            const imageSrc = optimizeImageUrl(product.imageUrl)
            const price = formatPriceRsd(
              product.priceRsd,
              t('product.priceUnavailable'),
              locale,
            )
            return (
              <li key={product.id}>
                <button
                  type="button"
                  className={`tryon-picker-item${active ? ' is-active' : ''}`}
                  onClick={() => onPick(product)}
                >
                  <span
                    className="tryon-picker-swatch"
                    style={{ background: product.shadeHex }}
                    aria-hidden="true"
                  >
                    {imageSrc ? (
                      <img
                        src={imageSrc}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : null}
                  </span>
                  <span className="tryon-picker-meta">
                    <span className="tryon-picker-brand">{product.brand}</span>
                    <span className="tryon-picker-name">
                      {productBaseName(product.name)}
                    </span>
                    <span className="tryon-picker-price">{price}</span>
                  </span>
                </button>
              </li>
            )
          })}
          {!filtered.length && (
            <li className="tryon-picker-empty">{t('tryon.pickEmpty')}</li>
          )}
        </ul>
      </div>
    </div>
  )
}
