import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { MakeupProduct } from '../types'
import { useLanguage } from '../i18n/LanguageContext'
import { findShadeVariants } from '../lib/shadeFamilies'

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
  catalog: MakeupProduct[]
}

export function ProductCard({ product, catalog }: ProductCardProps) {
  const { locale, t } = useLanguage()
  const variants = useMemo(
    () => findShadeVariants(product, catalog),
    [product, catalog],
  )
  const [selected, setSelected] = useState(product)
  const [imgFailed, setImgFailed] = useState(false)
  const [dragging, setDragging] = useState(false)
  const draggingRef = useRef(false)
  const dotsRef = useRef<HTMLDivElement>(null)
  const variantsById = useMemo(() => {
    const map = new Map<string, MakeupProduct>()
    for (const v of variants) map.set(v.id, v)
    return map
  }, [variants])

  useEffect(() => {
    setSelected(product)
    setImgFailed(false)
  }, [product.id])

  useEffect(() => {
    setImgFailed(false)
  }, [selected.id])

  function selectFromPoint(clientX: number, clientY: number) {
    const el = document.elementFromPoint(clientX, clientY)
    const btn = el?.closest<HTMLElement>('[data-shade-id]')
    if (!btn || !dotsRef.current?.contains(btn)) return
    const id = btn.dataset.shadeId
    if (!id) return
    const next = variantsById.get(id)
    if (next) setSelected(next)
  }

  function onShadePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    const id = event.currentTarget.dataset.shadeId
    if (id) {
      const next = variantsById.get(id)
      if (next) setSelected(next)
    }
    draggingRef.current = true
    setDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onShadePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!draggingRef.current) return
    event.preventDefault()
    selectFromPoint(event.clientX, event.clientY)
  }

  function onShadePointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!draggingRef.current) return
    event.preventDefault()
    selectFromPoint(event.clientX, event.clientY)
    draggingRef.current = false
    setDragging(false)
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      /* already released */
    }
  }

  const imageSrc = optimizeImageUrl(selected.imageUrl)
  const showImage = Boolean(imageSrc) && !imgFailed
  const href = selected.url
  const priceLabel = formatPriceRsd(
    selected.priceRsd,
    t('product.priceUnavailable'),
    locale,
  )

  const linkBody = (
    <>
      <div className="product-media">
        {showImage ? (
          <img
            className="product-image"
            src={imageSrc}
            alt={selected.name}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <span
            className="product-swatch large"
            style={{ background: selected.shadeHex }}
            aria-hidden="true"
          />
        )}
      </div>
      <div className="match-meta">
        <p className="product-name">{selected.name}</p>
        <p className="product-price">{priceLabel}</p>
      </div>
    </>
  )

  return (
    <div className="product-card-wrap">
      {href ? (
        <a
          className="zone-product-card"
          href={href}
          target="_blank"
          rel="noreferrer"
          aria-label={t('product.openDm', {
            name: selected.name,
            price: priceLabel,
          })}
        >
          {linkBody}
        </a>
      ) : (
        <div className="zone-product-card static">{linkBody}</div>
      )}

      {variants.length > 0 && (
        <div
          ref={dotsRef}
          className={dragging ? 'shade-dots is-dragging' : 'shade-dots'}
          role="listbox"
          aria-label={t('product.shades')}
        >
          {variants.map((variant) => {
            const selectedShade = variant.id === selected.id
            return (
              <button
                key={variant.id}
                type="button"
                role="option"
                data-shade-id={variant.id}
                aria-selected={selectedShade}
                className={
                  selectedShade ? 'shade-dot-btn is-selected' : 'shade-dot-btn'
                }
                style={{ background: variant.shadeHex }}
                title={variant.shadeName || variant.name}
                aria-label={variant.shadeName || variant.name}
                onPointerDown={onShadePointerDown}
                onPointerMove={onShadePointerMove}
                onPointerUp={onShadePointerUp}
                onPointerCancel={onShadePointerUp}
                onClick={(e) => {
                  // Selection already handled on pointerdown; block parent navigation.
                  e.preventDefault()
                  e.stopPropagation()
                }}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
