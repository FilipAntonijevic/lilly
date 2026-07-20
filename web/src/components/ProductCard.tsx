import { useState } from 'react'
import type { MakeupProduct } from '../types'

function formatPriceRsd(price?: number): string {
  if (typeof price !== 'number' || Number.isNaN(price)) return 'Cena nije dostupna'
  return (
    new Intl.NumberFormat('sr-RS', {
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
  const [imgFailed, setImgFailed] = useState(false)
  const imageSrc = optimizeImageUrl(product.imageUrl)
  const showImage = Boolean(imageSrc) && !imgFailed
  const href = product.url

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
        <p className="product-name">{product.name}</p>
        <p className="product-brand">
          {product.brand}
          {product.shadeName ? ` · nijansa ${product.shadeName}` : ''}
        </p>
        <p className="product-price">{formatPriceRsd(product.priceRsd)}</p>
        {reason && <p className="product-reason">{reason}</p>}
        {href && <span className="product-link">Pogledaj na dm.rs →</span>}
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
      aria-label={`${product.name}, ${formatPriceRsd(product.priceRsd)}, otvori na dm.rs`}
    >
      {body}
    </a>
  )
}
