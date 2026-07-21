import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
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

function tickHaptic() {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(10)
    }
  } catch {
    /* unsupported / denied */
  }
}

const SWIPE_THRESHOLD_PX = 88
const SHEET_DISMISS_PX = 96

type SwipeMode = 'pending' | 'horizontal' | 'vertical'

interface SwipeDrag {
  pointerId: number
  startX: number
  startY: number
  mode: SwipeMode
}

export function TryOnCartSheet({
  items,
  onRemove,
  onClose,
}: TryOnCartSheetProps) {
  const { locale, t } = useLanguage()
  const [dragY, setDragY] = useState(0)
  const [draggingSheet, setDraggingSheet] = useState(false)
  const [closing, setClosing] = useState(false)
  const sheetDragRef = useRef<{
    pointerId: number
    startY: number
    lastY: number
    lastT: number
    velocity: number
  } | null>(null)
  const dragYRef = useRef(0)
  const sheetRef = useRef<HTMLDivElement>(null)

  function setSheetOffset(next: number) {
    dragYRef.current = next
    setDragY(next)
  }

  function dismissSheet() {
    if (closing) return
    setClosing(true)
    setDraggingSheet(false)
    const h = sheetRef.current?.offsetHeight ?? 480
    setSheetOffset(h + 48)
    window.setTimeout(() => onClose(), 220)
  }

  function onSheetPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (closing) return
    const target = event.target as HTMLElement | null
    if (target?.closest('button, a')) return

    sheetDragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      lastT: performance.now(),
      velocity: 0,
    }
    setDraggingSheet(true)
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      /* ignore */
    }
  }

  function onSheetPointerMove(event: ReactPointerEvent<HTMLElement>) {
    const drag = sheetDragRef.current
    if (!drag || drag.pointerId !== event.pointerId || closing) return

    const now = performance.now()
    const dy = event.clientY - drag.startY
    const dt = Math.max(1, now - drag.lastT)
    drag.velocity = (event.clientY - drag.lastY) / dt
    drag.lastY = event.clientY
    drag.lastT = now

    // Only drag down; slight rubber-band upward.
    setSheetOffset(Math.max(-12, dy))
  }

  function onSheetPointerUp(event: ReactPointerEvent<HTMLElement>) {
    const drag = sheetDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    sheetDragRef.current = null
    setDraggingSheet(false)
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      /* already released */
    }

    const shouldClose =
      dragYRef.current >= SHEET_DISMISS_PX ||
      (dragYRef.current > 40 && drag.velocity > 0.55)
    if (shouldClose) {
      dismissSheet()
      return
    }
    setSheetOffset(0)
  }

  const backdropOpacity = closing
    ? 0
    : Math.max(0.12, 0.45 * (1 - Math.max(0, dragY) / 320))

  return (
    <div
      className="tryon-picker-backdrop"
      role="presentation"
      onClick={dismissSheet}
      style={{ background: `rgba(26, 22, 20, ${backdropOpacity})` }}
    >
      <div
        ref={sheetRef}
        className={`tryon-picker tryon-cart-sheet${draggingSheet ? ' is-dragging' : ''}${closing ? ' is-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={t('tryon.cartTitle')}
        onClick={(e) => e.stopPropagation()}
        style={{ transform: `translate3d(0, ${Math.max(0, dragY)}px, 0)` }}
      >
        <div
          className="tryon-sheet-grab"
          onPointerDown={onSheetPointerDown}
          onPointerMove={onSheetPointerMove}
          onPointerUp={onSheetPointerUp}
          onPointerCancel={onSheetPointerUp}
        >
          <div className="tryon-sheet-handle" aria-hidden="true">
            <span className="tryon-sheet-handle-bar" />
          </div>
          <header className="tryon-picker-top">
            <h3>{t('tryon.cartTitle')}</h3>
            <button type="button" className="tryon-chip" onClick={dismissSheet}>
              {t('tryon.pickClose')}
            </button>
          </header>
        </div>

        {items.length === 0 ? (
          <p className="tryon-picker-empty">{t('tryon.cartEmpty')}</p>
        ) : (
          <ul className="tryon-picker-list tryon-cart-list">
            {items.map((product) => (
              <CartSwipeItem
                key={product.id}
                product={product}
                priceLabel={formatPriceRsd(
                  product.priceRsd,
                  t('product.priceUnavailable'),
                  locale,
                )}
                openDmLabel={t('tryon.cartOpenDm')}
                removeLabel={t('tryon.cartRemove')}
                onRemove={() => onRemove(product.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function CartSwipeItem({
  product,
  priceLabel,
  openDmLabel,
  removeLabel,
  onRemove,
}: {
  product: MakeupProduct
  priceLabel: string
  openDmLabel: string
  removeLabel: string
  onRemove: () => void
}) {
  const [offsetX, setOffsetX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [exiting, setExiting] = useState(false)
  const dragRef = useRef<SwipeDrag | null>(null)
  const offsetRef = useRef(0)
  const rowRef = useRef<HTMLLIElement>(null)
  const imageSrc = optimizeImageUrl(product.imageUrl)

  function setOffset(next: number) {
    offsetRef.current = next
    setOffsetX(next)
  }

  function finishRemove() {
    if (exiting) return
    setExiting(true)
    tickHaptic()
    const width = rowRef.current?.offsetWidth ?? 320
    setOffset(-width)
    window.setTimeout(() => onRemove(), 180)
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (exiting) return
    // Ignore swipes that start on links/buttons — those keep their own click.
    const target = event.target as HTMLElement | null
    if (target?.closest('a, button')) return

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      mode: 'pending',
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId || exiting) return

    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY

    if (drag.mode === 'pending') {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      if (Math.abs(dy) >= Math.abs(dx)) {
        drag.mode = 'vertical'
        dragRef.current = null
        return
      }
      drag.mode = 'horizontal'
      setDragging(true)
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        /* ignore */
      }
    }

    if (drag.mode !== 'horizontal') return
    event.preventDefault()
    // Only swipe left (negative X); rubber-band slightly past 0 to the right.
    setOffset(Math.min(12, Math.max(-180, dx)))
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragging(false)
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      /* already released */
    }

    if (drag.mode === 'horizontal' && offsetRef.current <= -SWIPE_THRESHOLD_PX) {
      finishRemove()
      return
    }
    setOffset(0)
  }

  return (
    <li
      ref={rowRef}
      className={`tryon-cart-item${exiting ? ' is-exiting' : ''}`}
    >
      <div className="tryon-cart-item-rail" aria-hidden="true">
        <span>{removeLabel}</span>
      </div>
      <div
        className={`tryon-cart-item-swipe${dragging ? ' is-dragging' : ''}`}
        style={{ transform: `translate3d(${offsetX}px, 0, 0)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="tryon-cart-item-main">
          {imageSrc ? (
            <img
              className="tryon-cart-thumb"
              src={imageSrc}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              draggable={false}
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
            <span className="tryon-picker-price">{priceLabel}</span>
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
              {openDmLabel}
            </a>
          ) : null}
          <button type="button" className="tryon-chip" onClick={finishRemove}>
            {removeLabel}
          </button>
        </div>
      </div>
    </li>
  )
}
