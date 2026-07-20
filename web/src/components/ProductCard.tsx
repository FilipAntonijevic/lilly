import { useState } from 'react'
import type { MakeupProduct } from '../types'
import { useLanguage } from '../i18n/LanguageContext'

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

/** Prefer a slightly larger DM CDN crop when possible. */
function optimizeImageUrl(url?: string): string | undefined {
  if (!url) return undefined
  return url.replace(/h_320,w_320/g, 'h_480,w_480')
}

interface ProductCardProps {
  product: MakeupProduct
  reason?: string
}

export function ProductCard({ product, reason }: ProductCardProps) {
  const { locale, t } = useLanguage()
  const [imgFailed, setImgFailed] = useState(false)
  const imageSrc = optimizeImageUrl(product.imageUrl)
  const showImage = Boolean(imageSrc) && !imgFailed
  const href = product.url
  const priceLabel = formatPriceRsd(
    product.priceRsd,
    t('product.priceUnavailable'),
    locale,
  )

  const body = (
    <>
      <div className="product-media">
        {showImage ? (
          <img
            className="product-image"
            src={imageSrc}
            alt={product.name}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <span
            className="product-swatch large"
            style={{ background: product.shadeHex }}
            aria-hidden="true"
          />
        )}
        <span
          className="shade-dot"
          style={{ background: product.shadeHex }}
          title={product.shadeHex}
          aria-hidden="true"
        />
      </div>
      <div className="match-meta">
        {/* Product name / brand / shade stay as in catalog */}
        <p className="product-name">{product.name}</p>
        <p className="product-brand">
          {product.brand}
          {product.shadeName
            ? ` · ${t('product.shade', { name: product.shadeName })}`
            : ''}
        </p>
        <p className="product-price">{priceLabel}</p>
        {reason && <p className="product-reason">{reason}</p>}
        {href && <span className="product-link">{t('product.viewDm')}</span>}
      </div>
    </>
  )

  if (!href) {
    return <div className="zone-product-card static">{body}</div>
  }

  return (
    <a
      className="zone-product-card"
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={t('product.openDm', { name: product.name, price: priceLabel })}
    >
      {body}
    </a>
  )
}
