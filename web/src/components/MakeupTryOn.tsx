import {
  useEffect,
  useMemo,
  useRef,
  useState,
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
      // Lips use on/off (not a slider) — start off; other zones start at 50%.
      intensity: zoneId === 'lips' ? 0 : DEFAULT_INTENSITY,
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
}: MakeupTryOnProps) {
  const { t } = useLanguage()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const [imageReady, setImageReady] = useState(false)
  const [activeZone, setActiveZone] = useState<FaceZoneId>('eyes')
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

  function onIntensityWheel(e: ReactWheelEvent<HTMLLabelElement>) {
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
            <label className="tryon-intensity" onWheel={onIntensityWheel}>
              <span className="tryon-intensity-label">
                {t('tryon.intensity')}
                <strong>{t('tryon.layers', { pct: layersPct })}</strong>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={layersPct}
                disabled={!activeLayer.product}
                onInput={(e) =>
                  updateActiveLayer({
                    intensity: Number((e.target as HTMLInputElement).value) / 100,
                  })
                }
                onChange={(e) =>
                  updateActiveLayer({ intensity: Number(e.target.value) / 100 })
                }
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={layersPct}
                aria-label={t('tryon.intensity')}
              />
            </label>
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
