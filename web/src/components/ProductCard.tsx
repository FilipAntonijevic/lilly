import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { MakeupProduct } from '../types'
import { useLanguage } from '../i18n/LanguageContext'
import { tickHaptic } from '../lib/haptics'
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

/** Dot + gap used to estimate how many shades fit in one row. */
const SHADE_DOT_SLOT_PX = 1.55 * 16 + 0.7 * 16

function splitShadeRows(
  variants: MakeupProduct[],
  perRow: number,
): MakeupProduct[][] {
  if (variants.length === 0) return []
  if (variants.length <= perRow) return [variants]
  // At most two independent rows — balance counts so both stay usable.
  const mid = Math.ceil(variants.length / 2)
  return [variants.slice(0, mid), variants.slice(mid)]
}

interface ProductCardProps {
  product: MakeupProduct
  catalog: MakeupProduct[]
  /** Controlled selected shade; defaults to internal state from `product`. */
  selected?: MakeupProduct
  onSelectedChange?: (product: MakeupProduct) => void
  /**
   * When set, the product body opens this callback instead of the dm.rs URL
   * (used on try-on to open the category product picker).
   */
  onProductClick?: () => void
}

export function ProductCard({
  product,
  catalog,
  selected: selectedProp,
  onSelectedChange,
  onProductClick,
}: ProductCardProps) {
  const { locale, t } = useLanguage()
  const variants = useMemo(
    () => findShadeVariants(product, catalog),
    [product, catalog],
  )
  const [internalSelected, setInternalSelected] = useState(product)
  const selected = selectedProp ?? internalSelected
  const [imgFailed, setImgFailed] = useState(false)
  const selectedIdRef = useRef(selected.id)
  const cardWrapRef = useRef<HTMLDivElement>(null)
  const [perRow, setPerRow] = useState(12)
  const variantsById = useMemo(() => {
    const map = new Map<string, MakeupProduct>()
    for (const v of variants) map.set(v.id, v)
    return map
  }, [variants])

  const rows = useMemo(
    () => splitShadeRows(variants, perRow),
    [variants, perRow],
  )

  useEffect(() => {
    if (selectedProp) return
    setInternalSelected(product)
    selectedIdRef.current = product.id
    setImgFailed(false)
  }, [product.id, selectedProp])

  useEffect(() => {
    selectedIdRef.current = selected.id
  }, [selected.id])

  useEffect(() => {
    setImgFailed(false)
  }, [selected.id])

  useEffect(() => {
    const root = cardWrapRef.current
    if (!root) return

    function measure() {
      const width = root!.clientWidth
      if (width <= 0) return
      setPerRow(Math.max(1, Math.floor((width + 0.7 * 16) / SHADE_DOT_SLOT_PX)))
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(root)
    return () => ro.disconnect()
  }, [variants.length])

  function selectShade(next: MakeupProduct, haptic: boolean) {
    if (next.id === selectedIdRef.current) return
    selectedIdRef.current = next.id
    if (!selectedProp) setInternalSelected(next)
    onSelectedChange?.(next)
    if (haptic) tickHaptic()
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
    <div className="product-card-wrap" ref={cardWrapRef}>
      {onProductClick ? (
        <button
          type="button"
          className="zone-product-card as-button"
          onClick={onProductClick}
          aria-label={t('tryon.pickTitle')}
        >
          {linkBody}
        </button>
      ) : href ? (
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

      {rows.length > 0 && (
        <div
          className="shade-dots"
          role="listbox"
          aria-label={t('product.shades')}
        >
          {rows.map((row, rowIndex) => (
            <ShadeDotsRow
              key={`shade-row-${rowIndex}`}
              variants={row}
              selectedId={selected.id}
              variantsById={variantsById}
              selectedIdRef={selectedIdRef}
              onSelect={selectShade}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ShadeDotsRow({
  variants,
  selectedId,
  variantsById,
  selectedIdRef,
  onSelect,
}: {
  variants: MakeupProduct[]
  selectedId: string
  variantsById: Map<string, MakeupProduct>
  selectedIdRef: MutableRefObject<string>
  onSelect: (next: MakeupProduct, haptic: boolean) => void
}) {
  const rowRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const draggingRef = useRef(false)

  /** Map pointer X to the nearest circle in this row only. */
  function selectFromClientX(clientX: number) {
    const root = rowRef.current
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
    if (next) onSelect(next, true)
  }

  function onShadePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    const id = event.currentTarget.dataset.shadeId
    if (id) {
      const next = variantsById.get(id)
      if (next) {
        if (next.id === selectedIdRef.current) tickHaptic()
        else onSelect(next, true)
      }
    }
    draggingRef.current = true
    setDragging(true)
    const track = rowRef.current
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
    try {
      rowRef.current?.releasePointerCapture(event.pointerId)
    } catch {
      /* already released */
    }
  }

  return (
    <div
      ref={rowRef}
      className={dragging ? 'shade-dots-row is-dragging' : 'shade-dots-row'}
      onPointerMove={onShadePointerMove}
      onPointerUp={onShadePointerUp}
      onPointerCancel={onShadePointerUp}
    >
      {variants.map((variant) => {
        const selectedShade = variant.id === selectedId
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
              e.preventDefault()
              e.stopPropagation()
            }}
          />
        )
      })}
    </div>
  )
}
