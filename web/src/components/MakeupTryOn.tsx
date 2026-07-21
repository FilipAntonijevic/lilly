import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import { isMessageKey } from '../i18n/messages'
import {
  TRYON_ZONE_ORDER,
  buildTryOnPolygons,
} from '../lib/tryOnRegions'
import { paintSoftMakeup } from '../lib/tryOnRender'
import { shadeFamilyKey } from '../lib/shadeFamilies'
import type {
  FaceLandmarkPoint,
  FaceZoneId,
  FaceZoneMatch,
  MakeupProduct,
} from '../types'
import { ProductCard } from './ProductCard'
import { TryOnCartSheet } from './TryOnCartSheet'
import { TryOnProductPicker } from './TryOnProductPicker'

interface MakeupTryOnProps {
  photoUrl: string
  landmarks: FaceLandmarkPoint[]
  routine: FaceZoneMatch[]
  catalog: MakeupProduct[]
  onBack: () => void
}

interface ZoneLayerState {
  intensity: number
  /** Currently painted / selected shade */
  product: MakeupProduct | null
  /** Product line whose shade dots are shown */
  lineProduct: MakeupProduct | null
}

const DEFAULT_INTENSITY = 0.5

function initialZoneLayers(routine: FaceZoneMatch[]): Record<FaceZoneId, ZoneLayerState> {
  const layers = {} as Record<FaceZoneId, ZoneLayerState>
  for (const zoneId of TRYON_ZONE_ORDER) {
    const match = routine.find((z) => z.zoneId === zoneId)?.match?.product ?? null
    layers[zoneId] = {
      // Lips use on/off (not a slider) — start on with the recommended shade.
      intensity: zoneId === 'lips' ? 1 : DEFAULT_INTENSITY,
      product: match,
      lineProduct: match,
    }
  }
  return layers
}

/** Algorithm picks for each zone, unique by product id, zone order preserved. */
function initialCartFromRoutine(routine: FaceZoneMatch[]): MakeupProduct[] {
  const seen = new Set<string>()
  const out: MakeupProduct[] = []
  for (const zoneId of TRYON_ZONE_ORDER) {
    const product = routine.find((z) => z.zoneId === zoneId)?.match?.product
    if (!product || seen.has(product.id)) continue
    seen.add(product.id)
    out.push(product)
  }
  return out
}

export function MakeupTryOn({
  photoUrl,
  landmarks,
  routine,
  catalog,
  onBack,
}: MakeupTryOnProps) {
  const { t } = useLanguage()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const [imageReady, setImageReady] = useState(false)
  const [activeZone, setActiveZone] = useState<FaceZoneId>('faceBase')
  const [layers, setLayers] = useState<Record<FaceZoneId, ZoneLayerState>>(() =>
    initialZoneLayers(routine),
  )
  const [cart, setCart] = useState<MakeupProduct[]>(() =>
    initialCartFromRoutine(routine),
  )
  const [pickerOpen, setPickerOpen] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  /** Master switch: hide all applied makeup without wiping intensities. */
  const [filtersOn, setFiltersOn] = useState(true)

  const polygons = useMemo(() => buildTryOnPolygons(landmarks), [landmarks])

  const zoneTabs = useMemo(() => {
    return TRYON_ZONE_ORDER.map((zoneId) => {
      const zone = routine.find((z) => z.zoneId === zoneId)
      const label = zone?.zoneLabel
      return {
        zoneId,
        label:
          label && isMessageKey(label) ? t(label) : zoneId,
      }
    })
  }, [routine, t])

  const activeLayer = layers[activeZone]

  useEffect(() => {
    setLayers(initialZoneLayers(routine))
    setCart(initialCartFromRoutine(routine))
  }, [routine])

  useEffect(() => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      imageRef.current = img
      setImageReady(true)
    }
    img.onerror = () => {
      imageRef.current = null
      setImageReady(false)
    }
    img.src = photoUrl
    return () => {
      img.onload = null
      img.onerror = null
    }
  }, [photoUrl])

  useEffect(() => {
    if (!imageReady) return
    const canvas = canvasRef.current
    const img = imageRef.current
    if (!canvas || !img) return

    const width = img.naturalWidth || img.width
    const height = img.naturalHeight || img.height
    if (!width || !height) return

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)

    const paintLayers = {} as Record<
      FaceZoneId,
      { intensity: number; product: MakeupProduct | null }
    >
    for (const zoneId of TRYON_ZONE_ORDER) {
      const layer = layers[zoneId]
      paintLayers[zoneId] = {
        intensity: filtersOn ? (layer?.intensity ?? 0) : 0,
        product: layer?.product ?? null,
      }
    }

    paintSoftMakeup({
      ctx,
      width,
      height,
      polygons,
      layers: paintLayers,
      landmarks,
    })
  }, [imageReady, polygons, layers, landmarks, filtersOn])

  function updateActiveLayer(patch: Partial<ZoneLayerState>) {
    setLayers((prev) => ({
      ...prev,
      [activeZone]: { ...prev[activeZone], ...patch },
    }))
  }

  function onIntensityWheel(e: ReactWheelEvent<HTMLDivElement>) {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.03 : 0.03
    updateActiveLayer({
      intensity: clamp01(activeLayer.intensity + delta),
    })
  }

  const layersPct = Math.round(activeLayer.intensity * 100)
  const recommended = routine.find((z) => z.zoneId === activeZone)?.match?.product
  const activeCategory =
    routine.find((z) => z.zoneId === activeZone)?.category ?? 'lipstick'
  const cardProduct =
    activeLayer.lineProduct ?? activeLayer.product ?? recommended ?? null
  const isLipsZone = activeZone === 'lips'
  const lipsOn = (layers.lips?.intensity ?? 0) > 0.5
  const currentProduct = activeLayer.product
  const currentInCart = Boolean(
    currentProduct && cart.some((p) => p.id === currentProduct.id),
  )

  function pickProductLine(product: MakeupProduct) {
    updateActiveLayer({
      product,
      lineProduct: product,
      ...(activeZone === 'lips' ? { intensity: 1 } : {}),
    })
    setPickerOpen(false)
  }

  function setLipsOn(on: boolean) {
    updateActiveLayer({ intensity: on ? 1 : 0 })
  }

  function addCurrentToCart() {
    if (!currentProduct) return
    setCart((prev) => {
      if (prev.some((p) => p.id === currentProduct.id)) return prev
      return [...prev, currentProduct]
    })
  }

  function removeFromCart(productId: string) {
    setCart((prev) => prev.filter((p) => p.id !== productId))
  }

  return (
    <div className="tryon">
      <div className="tryon-main">
        <div className="tryon-stage">
          <canvas
            ref={canvasRef}
            className="tryon-canvas"
            aria-label={t('tryon.canvasLabel')}
          />
          <button
            type="button"
            className="tryon-back-overlay"
            onClick={onBack}
          >
            {t('tryon.back')}
          </button>
          <button
            type="button"
            className={`tryon-filters-toggle${filtersOn ? ' is-on' : ''}`}
            aria-pressed={filtersOn}
            aria-label={t('tryon.allFilters')}
            onClick={() => setFiltersOn((on) => !on)}
          >
            <span className="tryon-filters-toggle-label">
              {t('tryon.allFilters')}
            </span>
            <span className="tryon-filters-toggle-state">
              {filtersOn ? t('tryon.allFiltersOn') : t('tryon.allFiltersOff')}
            </span>
          </button>
        </div>

        <div
          className="tryon-zone-tabs"
          role="tablist"
          aria-label={t('tryon.regions')}
        >
          {zoneTabs.map((tab) => {
            const isActive = tab.zoneId === activeZone
            const layer = layers[tab.zoneId]
            const hasMakeup =
              tab.zoneId === 'lips'
                ? (layer?.intensity ?? 0) > 0.5
                : (layer?.intensity ?? 0) > 0.01
            return (
              <button
                key={tab.zoneId}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`tryon-zone-tab${isActive ? ' is-active' : ''}${hasMakeup ? ' is-applied' : ''}`}
                onClick={() => {
                  setActiveZone(tab.zoneId)
                  setPickerOpen(false)
                }}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        <div className="tryon-zone-panel">
          {cardProduct && activeLayer.product ? (
            <ProductCard
              product={cardProduct}
              catalog={catalog}
              selected={activeLayer.product}
              onSelectedChange={(product) => {
                updateActiveLayer({ product })
              }}
              onProductClick={() => setPickerOpen(true)}
            />
          ) : (
            <p className="zone-empty">{t('results.emptyZone')}</p>
          )}

          {isLipsZone ? (
            <div className="tryon-lips-toggle">
              <span className="tryon-intensity-label">{t('tryon.lipsToggle')}</span>
              <button
                type="button"
                className={`btn-lips-toggle${lipsOn ? ' is-on' : ''}`}
                aria-pressed={lipsOn}
                disabled={!activeLayer.product}
                onClick={() => setLipsOn(!lipsOn)}
              >
                {lipsOn ? t('tryon.lipsOn') : t('tryon.lipsOff')}
              </button>
            </div>
          ) : (
            <div className="tryon-intensity" onWheel={onIntensityWheel}>
              <div className="tryon-intensity-label">
                <span>{t('tryon.intensity')}</span>
                <strong>{t('tryon.layers', { pct: layersPct })}</strong>
              </div>
              <IntensitySlider
                value={activeLayer.intensity}
                disabled={!activeLayer.product}
                ariaLabel={t('tryon.intensity')}
                onChange={(intensity) => updateActiveLayer({ intensity })}
              />
            </div>
          )}

          <p className="tryon-hint">
            {isLipsZone ? t('tryon.hintLips') : t('tryon.hintView')}
          </p>
        </div>
      </div>

      <footer className="tryon-cart-bar">
        <button
          type="button"
          className="tryon-cart-summary"
          onClick={() => setCartOpen(true)}
        >
          {t('tryon.cartCount', { count: cart.length })}
        </button>
        <button
          type="button"
          className="btn-tryon-cart"
          disabled={!currentProduct || currentInCart}
          onClick={addCurrentToCart}
        >
          {currentInCart ? t('tryon.inCart') : t('tryon.addToCart')}
        </button>
      </footer>

      {pickerOpen && (
        <TryOnProductPicker
          category={activeCategory}
          catalog={catalog}
          selectedId={activeLayer.product?.id ?? null}
          selectedLineKey={
            cardProduct ? shadeFamilyKey(cardProduct) : null
          }
          onPick={pickProductLine}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {cartOpen && (
        <TryOnCartSheet
          items={cart}
          onRemove={removeFromCart}
          onClose={() => setCartOpen(false)}
        />
      )}
    </div>
  )
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

function IntensitySlider({
  value,
  disabled,
  ariaLabel,
  onChange,
}: {
  value: number
  disabled?: boolean
  ariaLabel: string
  onChange: (next: number) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const pct = Math.round(clamp01(value) * 100)

  function valueFromClientX(clientX: number): number | null {
    const track = trackRef.current
    if (!track) return null
    const rect = track.getBoundingClientRect()
    if (rect.width <= 0) return null
    return clamp01((clientX - rect.left) / rect.width)
  }

  function applyClientX(clientX: number) {
    const next = valueFromClientX(clientX)
    if (next == null) return
    onChange(next)
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (disabled) return
    event.preventDefault()
    draggingRef.current = true
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      /* ignore */
    }
    applyClientX(event.clientX)
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current || disabled) return
    event.preventDefault()
    applyClientX(event.clientX)
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return
    draggingRef.current = false
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      /* already released */
    }
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (disabled) return
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault()
      onChange(clamp01(value - 0.01))
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault()
      onChange(clamp01(value + 0.01))
    } else if (event.key === 'Home') {
      event.preventDefault()
      onChange(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      onChange(1)
    }
  }

  return (
    <div
      ref={trackRef}
      className={`tryon-intensity-track${disabled ? ' is-disabled' : ''}`}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-disabled={disabled || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    >
      <div className="tryon-intensity-fill" style={{ width: `${pct}%` }} />
      <div className="tryon-intensity-thumb" style={{ left: `${pct}%` }} />
    </div>
  )
}
