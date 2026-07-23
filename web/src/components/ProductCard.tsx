import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { MakeupProduct } from '../types'
import { chainConfig } from '../config/chain'
import { useLanguage } from '../i18n/LanguageContext'
import { fitFontToLineBox } from '../lib/fitTwoLineText'
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
        <ProductName name={selected.name} />
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
            shop: chainConfig.shopHost,
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

function ProductName({ name }: { name: string }) {
  const ref = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    function fit() {
      fitFontToLineBox(el!, { maxPx: 16, minPx: 11 })
    }

    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [name])

  return (
    <p ref={ref} className="product-name">
      {name}
    </p>
  )
}

type ShadeGestureMode = 'pending' | 'horizontal' | 'vertical'

interface ShadeGesture {
  pointerId: number
  startX: number
  startY: number
  mode: ShadeGestureMode
  startShadeId: string | null
}

const AXIS_LOCK_PX = 8

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
  const gestureRef = useRef<ShadeGesture | null>(null)

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

  function selectShadeId(id: string | null) {
    if (!id) return
    const next = variantsById.get(id)
    if (!next) return
    if (next.id === selectedIdRef.current) tickHaptic()
    else onSelect(next, true)
  }

  function beginHorizontal(
    event: ReactPointerEvent<HTMLDivElement>,
    gesture: ShadeGesture,
  ) {
    gesture.mode = 'horizontal'
    setDragging(true)
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      /* ignore */
    }
    selectFromClientX(event.clientX)
  }

  function onRowPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    const target = (event.target as HTMLElement | null)?.closest?.(
      '[data-shade-id]',
    ) as HTMLElement | null
    // Do not preventDefault — vertical moves must be able to scroll the page.
    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      mode: 'pending',
      startShadeId: target?.dataset.shadeId ?? null,
    }
  }

  function onRowPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return

    const dx = event.clientX - gesture.startX
    const dy = event.clientY - gesture.startY

    if (gesture.mode === 'pending') {
      if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return
      if (Math.abs(dy) >= Math.abs(dx)) {
        // Vertical intent — abandon shade drag so the page can scroll.
        gesture.mode = 'vertical'
        return
      }
      beginHorizontal(event, gesture)
      event.preventDefault()
      return
    }

    if (gesture.mode !== 'horizontal') return
    event.preventDefault()
    selectFromClientX(event.clientX)
  }

  function onRowPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    gestureRef.current = null

    if (gesture.mode === 'vertical') {
      setDragging(false)
      return
    }

    if (gesture.mode === 'pending') {
      selectShadeId(gesture.startShadeId)
    } else if (gesture.mode === 'horizontal') {
      selectFromClientX(event.clientX)
    }

    setDragging(false)
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      /* already released / never captured */
    }
  }

  return (
    <div
      ref={rowRef}
      className={dragging ? 'shade-dots-row is-dragging' : 'shade-dots-row'}
      onPointerDown={onRowPointerDown}
      onPointerMove={onRowPointerMove}
      onPointerUp={onRowPointerUp}
      onPointerCancel={onRowPointerUp}
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
