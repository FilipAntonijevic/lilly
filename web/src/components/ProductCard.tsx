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

/** Short light tap — same feel for press and drag-enter. */
function tickHaptic() {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(8)
    }
  } catch {
    /* unsupported / denied */
  }
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
  const selectedIdRef = useRef(product.id)
  const dotsRef = useRef<HTMLDivElement>(null)
  const variantsById = useMemo(() => {
    const map = new Map<string, MakeupProduct>()
    for (const v of variants) map.set(v.id, v)
    return map
  }, [variants])

  useEffect(() => {
    setSelected(product)
    selectedIdRef.current = product.id
    setImgFailed(false)
  }, [product.id])

  useEffect(() => {
    setImgFailed(false)
  }, [selected.id])

  function selectShade(next: MakeupProduct, haptic: boolean) {
    if (next.id === selectedIdRef.current) return
    selectedIdRef.current = next.id
    setSelected(next)
    if (haptic) tickHaptic()
  }

  /**
   * While finger is down, map only X to the nearest shade circle.
   * Y can leave the row — drag continues until pointer up.
   */
  function selectFromClientX(clientX: number) {
    const root = dotsRef.current
    if (!root) return
    const buttons = root.querySelectorAll<HTMLElement>('[data-shade-id]')
    if (!buttons.length) return

    let best: HTMLElement | null = null
    let bestDist = Infinity
    for (const btn of buttons) {
      const rect = btn.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const dist = Math.abs(clientX - cx)
      if (dist < bestDist) {
        bestDist = dist
        best = btn
      }
    }
    if (!best) return
    const id = best.dataset.shadeId
    if (!id) return
    const next = variantsById.get(id)
    if (next) selectShade(next, true)
  }

  function onShadePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    const id = event.currentTarget.dataset.shadeId
    if (id) {
      const next = variantsById.get(id)
      // Always tick on press, even if already selected (same as tapping that circle).
      if (next) {
        if (next.id === selectedIdRef.current) tickHaptic()
        else selectShade(next, true)
      }
    }
    draggingRef.current = true
    setDragging(true)
    // Capture on the track so moves keep coming after Y leaves the dots.
    const track = dotsRef.current
    if (track) {
      try {
        track.setPointerCapture(event.pointerId)
      } catch {
        event.currentTarget.setPointerCapture(event.pointerId)
      }
    } else {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
  }

  function onShadePointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (!draggingRef.current) return
    event.preventDefault()
    selectFromClientX(event.clientX)
  }

  function onShadePointerUp(event: ReactPointerEvent<HTMLElement>) {
    if (!draggingRef.current) return
    event.preventDefault()
    selectFromClientX(event.clientX)
    draggingRef.current = false
    setDragging(false)
    const track = dotsRef.current
    try {
      track?.releasePointerCapture(event.pointerId)
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
          onPointerMove={onShadePointerMove}
          onPointerUp={onShadePointerUp}
          onPointerCancel={onShadePointerUp}
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
