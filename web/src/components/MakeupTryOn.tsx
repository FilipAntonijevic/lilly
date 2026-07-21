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
import type {
  FaceLandmarkPoint,
  FaceZoneId,
  FaceZoneMatch,
  MakeupProduct,
} from '../types'
import { ProductCard } from './ProductCard'

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
        intensity: layer?.intensity ?? 0,
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
  }, [imageReady, polygons, layers, landmarks])

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
  const cardProduct =
    activeLayer.lineProduct ?? activeLayer.product ?? recommended ?? null
  const isLipsZone = activeZone === 'lips'
  const lipsOn = (layers.lips?.intensity ?? 0) > 0.5

  function setLipsOn(on: boolean) {
    updateActiveLayer({ intensity: on ? 1 : 0 })
  }

  return (
    <div className="tryon">
      <div className="tryon-stage">
        <canvas
          ref={canvasRef}
          className="tryon-canvas"
          aria-label={t('tryon.canvasLabel')}
        />
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
              onClick={() => setActiveZone(tab.zoneId)}
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
  )
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}
