import {
  useEffect,
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
/** Close when released past this fraction of sheet height (or absolute px floor). */
const SHEET_DISMISS_RATIO = 0.22
const SHEET_DISMISS_MIN_PX = 72

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
  const [closing, setClosing] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const grabRef = useRef<HTMLDivElement>(null)
  const dragYRef = useRef(0)
  const closingRef = useRef(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const sheetDragRef = useRef<{
    pointerId: number
    startY: number
    originY: number
    lastY: number
    lastT: number
    velocity: number
  } | null>(null)

  function applySheetY(y: number) {
    const next = Math.max(0, y)
    dragYRef.current = next
    const sheet = sheetRef.current
    if (sheet) {
      sheet.style.transform = `translate3d(0, ${next}px, 0)`
    }
    const backdrop = backdropRef.current
    if (backdrop) {
      const opacity = Math.max(0.08, 0.45 * (1 - next / 360))
      backdrop.style.background = `rgba(26, 22, 20, ${opacity})`
    }
  }

  function setSheetDragging(active: boolean) {
    sheetRef.current?.classList.toggle('is-dragging', active)
  }

  useEffect(() => {
    const node = grabRef.current
    if (!node) return
    const grabEl: HTMLElement = node

    function dismissSheet() {
      if (closingRef.current) return
      closingRef.current = true
      setClosing(true)
      setSheetDragging(false)
      const h = sheetRef.current?.offsetHeight ?? 480
      const sheet = sheetRef.current
      if (sheet) {
        sheet.classList.add('is-closing')
        sheet.style.transition = 'transform 0.22s ease'
        sheet.style.transform = `translate3d(0, ${h + 64}px, 0)`
      }
      if (backdropRef.current) {
        backdropRef.current.style.transition =
          'background 0.22s ease, opacity 0.22s ease'
        backdropRef.current.style.background = 'rgba(26, 22, 20, 0)'
      }
      window.setTimeout(() => onCloseRef.current(), 220)
    }

    function snapSheetOpen() {
      setSheetDragging(false)
      const sheet = sheetRef.current
      if (sheet) {
        sheet.style.transition = 'transform 0.22s ease'
        sheet.style.transform = 'translate3d(0, 0, 0)'
      }
      if (backdropRef.current) {
        backdropRef.current.style.transition = 'background 0.22s ease'
        backdropRef.current.style.background = 'rgba(26, 22, 20, 0.45)'
      }
      dragYRef.current = 0
    }

    function onPointerDown(event: PointerEvent) {
      if (closingRef.current) return
      const target = event.target as HTMLElement | null
      if (target?.closest('button, a')) return

      sheetDragRef.current = {
        pointerId: event.pointerId,
        startY: event.clientY,
        originY: dragYRef.current,
        lastY: event.clientY,
        lastT: performance.now(),
        velocity: 0,
      }
      setSheetDragging(true)
      const sheet = sheetRef.current
      if (sheet) sheet.style.transition = 'none'
      if (backdropRef.current) backdropRef.current.style.transition = 'none'
      try {
        grabEl.setPointerCapture(event.pointerId)
      } catch {
        /* ignore */
      }
      event.preventDefault()
    }

    function onPointerMove(event: PointerEvent) {
      const drag = sheetDragRef.current
      if (!drag || drag.pointerId !== event.pointerId || closingRef.current) return

      const now = performance.now()
      const dt = Math.max(1, now - drag.lastT)
      drag.velocity = (event.clientY - drag.lastY) / dt
      drag.lastY = event.clientY
      drag.lastT = now

      const dy = event.clientY - drag.startY
      applySheetY(drag.originY + dy)
      event.preventDefault()
    }

    function onPointerUp(event: PointerEvent) {
      const drag = sheetDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      sheetDragRef.current = null
      try {
        grabEl.releasePointerCapture(event.pointerId)
      } catch {
        /* already released */
      }

      const y = dragYRef.current
      const sheetH = sheetRef.current?.offsetHeight ?? 480
      const threshold = Math.max(SHEET_DISMISS_MIN_PX, sheetH * SHEET_DISMISS_RATIO)
      const flingClose = y > 36 && drag.velocity > 0.45
      if (y >= threshold || flingClose) {
        dismissSheet()
        return
      }
      snapSheetOpen()
    }

    grabEl.addEventListener('pointerdown', onPointerDown, { passive: false })
    grabEl.addEventListener('pointermove', onPointerMove, { passive: false })
    grabEl.addEventListener('pointerup', onPointerUp)
    grabEl.addEventListener('pointercancel', onPointerUp)
    return () => {
      grabEl.removeEventListener('pointerdown', onPointerDown)
      grabEl.removeEventListener('pointermove', onPointerMove)
      grabEl.removeEventListener('pointerup', onPointerUp)
      grabEl.removeEventListener('pointercancel', onPointerUp)
    }
  }, [])

  return (
    <div
      ref={backdropRef}
      className="tryon-picker-backdrop"
      role="presentation"
      onClick={() => {
        if (closingRef.current) return
        closingRef.current = true
        setClosing(true)
        setSheetDragging(false)
        const h = sheetRef.current?.offsetHeight ?? 480
        const sheet = sheetRef.current
        if (sheet) {
          sheet.classList.add('is-closing')
          sheet.style.transition = 'transform 0.22s ease'
          sheet.style.transform = `translate3d(0, ${h + 64}px, 0)`
        }
        if (backdropRef.current) {
          backdropRef.current.style.transition =
            'background 0.22s ease, opacity 0.22s ease'
          backdropRef.current.style.background = 'rgba(26, 22, 20, 0)'
        }
        window.setTimeout(() => onCloseRef.current(), 220)
      }}
    >
      <div
        ref={sheetRef}
        className={`tryon-picker tryon-cart-sheet${closing ? ' is-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={t('tryon.cartTitle')}
        onClick={(e) => e.stopPropagation()}
      >
        <div ref={grabRef} className="tryon-sheet-grab">
          <div className="tryon-sheet-handle" aria-hidden="true">
            <span className="tryon-sheet-handle-bar" />
          </div>
          <header className="tryon-picker-top">
            <h3>{t('tryon.cartTitle')}</h3>
            <button
              type="button"
              className="tryon-chip"
              onClick={(e) => {
                e.stopPropagation()
                if (closingRef.current) return
                closingRef.current = true
                setClosing(true)
                const h = sheetRef.current?.offsetHeight ?? 480
                const sheet = sheetRef.current
                if (sheet) {
                  sheet.classList.add('is-closing')
                  sheet.style.transition = 'transform 0.22s ease'
                  sheet.style.transform = `translate3d(0, ${h + 64}px, 0)`
                }
                if (backdropRef.current) {
                  backdropRef.current.style.transition =
                    'background 0.22s ease, opacity 0.22s ease'
                  backdropRef.current.style.background = 'rgba(26, 22, 20, 0)'
                }
                window.setTimeout(() => onCloseRef.current(), 220)
              }}
            >
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
    // Left only — can return toward 0, never past the default resting position.
    setOffset(Math.min(0, Math.max(-200, dx)))
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
