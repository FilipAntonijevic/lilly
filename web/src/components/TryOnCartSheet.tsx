import { useLanguage } from '../i18n/LanguageContext'
import type { MakeupProduct } from '../types'

interface TryOnCartSheetProps {
  items: MakeupProduct[]
  onRemove: (productId: string) => void
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

export function TryOnCartSheet({
  items,
  onRemove,
  onClose,
}: TryOnCartSheetProps) {
  const { locale, t } = useLanguage()

  return (
    <div className="tryon-picker-backdrop" role="presentation" onClick={onClose}>
      <div
        className="tryon-picker tryon-cart-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t('tryon.cartTitle')}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="tryon-picker-top">
          <h3>{t('tryon.cartTitle')}</h3>
          <button type="button" className="tryon-chip" onClick={onClose}>
            {t('tryon.pickClose')}
          </button>
        </header>

        {items.length === 0 ? (
          <p className="tryon-picker-empty">{t('tryon.cartEmpty')}</p>
        ) : (
          <ul className="tryon-picker-list">
            {items.map((product) => {
              const imageSrc = optimizeImageUrl(product.imageUrl)
              const price = formatPriceRsd(
                product.priceRsd,
                t('product.priceUnavailable'),
                locale,
              )
              return (
                <li key={product.id} className="tryon-cart-item">
                  <div className="tryon-cart-item-main">
                    {imageSrc ? (
                      <img
                        className="tryon-cart-thumb"
                        src={imageSrc}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span
                        className="tryon-picker-swatch"
                        style={{ background: product.shadeHex }}
                        aria-hidden="true"
                      />
                    )}
                    <div className="tryon-picker-meta">
                      <span className="tryon-picker-brand">{product.brand}</span>
                      <span className="tryon-picker-name">{product.name}</span>
                      <span className="tryon-picker-price">{price}</span>
                    </div>
                  </div>
                  <div className="tryon-cart-item-actions">
                    {product.url ? (
                      <a
                        className="tryon-chip"
                        href={product.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t('tryon.cartOpenDm')}
                      </a>
                    ) : null}
                    <button
                      type="button"
                      className="tryon-chip"
                      onClick={() => onRemove(product.id)}
                    >
                      {t('tryon.cartRemove')}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
