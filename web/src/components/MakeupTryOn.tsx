import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import { isMessageKey } from '../i18n/messages'
import type { TryOnPolygonId } from '../lib/faceLandmarker'
import {
  TRYON_ZONE_ORDER,
  buildTryOnPolygons,
  clonePolygons,
  polygonsForZone,
  type EditableTryOnPolygon,
  type Point2D,
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
import { TryOnProductPicker } from './TryOnProductPicker'

interface MakeupTryOnProps {
  photoUrl: string
  landmarks: FaceLandmarkPoint[]
  routine: FaceZoneMatch[]
  catalog: MakeupProduct[]
}

interface DragState {
  regionId: TryOnPolygonId
  pointIndex: number
}

interface ZoneLayerState {
  intensity: number
  /** Currently painted / selected shade */
  product: MakeupProduct | null
  /** Product line whose shade dots are shown */
  lineProduct: MakeupProduct | null
}

const HANDLE_HIT_PX = 16
const DEFAULT_INTENSITY = 0

function initialZoneLayers(routine: FaceZoneMatch[]): Record<FaceZoneId, ZoneLayerState> {
  const layers = {} as Record<FaceZoneId, ZoneLayerState>
  for (const zoneId of TRYON_ZONE_ORDER) {
    const match = routine.find((z) => z.zoneId === zoneId)?.match?.product ?? null
    layers[zoneId] = {
      intensity: DEFAULT_INTENSITY,
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
  const [polygons, setPolygons] = useState<EditableTryOnPolygon[]>(() =>
    buildTryOnPolygons(landmarks),
  )
  const [activeZone, setActiveZone] = useState<FaceZoneId>('eyes')
  const [layers, setLayers] = useState<Record<FaceZoneId, ZoneLayerState>>(() =>
    initialZoneLayers(routine),
  )
  const [pickerOpen, setPickerOpen] = useState(false)
  const dragRef = useRef<DragState | null>(null)
  const basePolygonsRef = useRef(polygons)

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
  const activePolygons = useMemo(
    () => polygonsForZone(polygons, activeZone),
    [polygons, activeZone],
  )

  useEffect(() => {
    const next = buildTryOnPolygons(landmarks)
    setPolygons(next)
    basePolygonsRef.current = next
  }, [landmarks])

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

    paintSoftMakeup({
      ctx,
      width,
      height,
      polygons,
      layers,
      landmarks,
    })

    for (const poly of activePolygons) {
      ctx.save()
      ctx.strokeStyle = 'rgba(255, 248, 243, 0.9)'
      ctx.lineWidth = 2
      ctx.setLineDash([5, 4])
      if (poly.kind === 'circle' && poly.points.length >= 2) {
        const [c, rim] = poly.points
        const cx = c.x * width
        const cy = c.y * height
        const r =
          Math.hypot(rim.x - c.x, rim.y - c.y) * Math.min(width, height)
        ctx.beginPath()
        ctx.arc(cx, cy, Math.max(4, r), 0, Math.PI * 2)
        ctx.stroke()
      } else {
        pathPolygon(ctx, poly.points, width, height)
        ctx.stroke()
      }
      ctx.restore()

      for (const point of poly.points) {
        const px = point.x * width
        const py = point.y * height
        ctx.beginPath()
        ctx.fillStyle = 'rgba(26, 22, 20, 0.85)'
        ctx.arc(px, py, Math.max(5, width * 0.008), 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.fillStyle = '#fff8f3'
        ctx.arc(px, py, Math.max(3, width * 0.005), 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }, [imageReady, polygons, layers, activePolygons, landmarks])

  function clientToNorm(clientX: number, clientY: number): Point2D | null {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    return {
      x: clamp01((clientX - rect.left) / rect.width),
      y: clamp01((clientY - rect.top) / rect.height),
    }
  }

  function hitTest(norm: Point2D): DragState | null {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const hitNormX = HANDLE_HIT_PX / rect.width
    const hitNormY = HANDLE_HIT_PX / rect.height

    let best: DragState | null = null
    let bestDist = Infinity
    for (const poly of activePolygons) {
      poly.points.forEach((point, pointIndex) => {
        const dx = (point.x - norm.x) / hitNormX
        const dy = (point.y - norm.y) / hitNormY
        const dist = dx * dx + dy * dy
        if (dist <= 1 && dist < bestDist) {
          bestDist = dist
          best = { regionId: poly.id, pointIndex }
        }
      })
    }
    return best
  }

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    const norm = clientToNorm(e.clientX, e.clientY)
    if (!norm) return
    const hit = hitTest(norm)
    if (!hit) return
    dragRef.current = hit
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault()
  }

  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current
    if (!drag) return
    const norm = clientToNorm(e.clientX, e.clientY)
    if (!norm) return
    setPolygons((prev) => {
      const next = clonePolygons(prev)
      const poly = next.find((p) => p.id === drag.regionId)
      if (!poly || !poly.points[drag.pointIndex]) return prev
      if (poly.kind === 'circle' && drag.pointIndex === 0 && poly.points[1]) {
        const dx = norm.x - poly.points[0].x
        const dy = norm.y - poly.points[0].y
        poly.points[0] = norm
        poly.points[1] = {
          x: clamp01(poly.points[1].x + dx),
          y: clamp01(poly.points[1].y + dy),
        }
      } else {
        poly.points[drag.pointIndex] = norm
      }
      return next
    })
  }

  function onPointerUp(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!dragRef.current) return
    dragRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
  }

  function resetActivePolygons() {
    const base = basePolygonsRef.current
    setPolygons((prev) => {
      const next = clonePolygons(prev)
      for (const poly of next) {
        if (poly.zoneId !== activeZone) continue
        const original = base.find((p) => p.id === poly.id)
        if (original) poly.points = original.points.map((p) => ({ ...p }))
      }
      return next
    })
  }

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

  function pickProductLine(product: MakeupProduct) {
    updateActiveLayer({ product, lineProduct: product })
    setPickerOpen(false)
  }

  return (
    <div className="tryon">
      <div className="tryon-stage">
        <canvas
          ref={canvasRef}
          className="tryon-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
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
          const hasMakeup = (layers[tab.zoneId]?.intensity ?? 0) > 0.01
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
            onSelectedChange={(product) => updateActiveLayer({ product })}
          />
        ) : (
          <p className="zone-empty">{t('results.emptyZone')}</p>
        )}

        <div className="tryon-zone-actions">
          <button
            type="button"
            className="btn-tryon-pick"
            onClick={() => setPickerOpen(true)}
          >
            {t('tryon.pickSelf')}
          </button>
          <button
            type="button"
            className="tryon-chip"
            onClick={resetActivePolygons}
          >
            {t('tryon.reset')}
          </button>
        </div>

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
            onChange={(e) =>
              updateActiveLayer({ intensity: Number(e.target.value) / 100 })
            }
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={layersPct}
            aria-label={t('tryon.intensity')}
          />
        </label>

        <p className="tryon-hint">{t('tryon.hintZone')}</p>
      </div>

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
    </div>
  )
}

function pathPolygon(
  ctx: CanvasRenderingContext2D,
  points: Point2D[],
  width: number,
  height: number,
) {
  ctx.beginPath()
  points.forEach((point, i) => {
    const x = point.x * width
    const y = point.y * height
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.closePath()
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}
