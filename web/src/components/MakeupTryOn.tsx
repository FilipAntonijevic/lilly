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
  TRYON_BASE_ALPHA,
  TRYON_BLEND,
  TRYON_DRAW_ORDER,
  TRYON_ZONE_ORDER,
  buildTryOnPolygons,
  clonePolygons,
  polygonsForZone,
  type EditableTryOnPolygon,
  type Point2D,
} from '../lib/tryOnRegions'
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

interface DragState {
  regionId: TryOnPolygonId
  pointIndex: number
}

interface ZoneLayerState {
  intensity: number
  product: MakeupProduct | null
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

    const layer = document.createElement('canvas')
    layer.width = width
    layer.height = height
    const lctx = layer.getContext('2d')
    if (!lctx) return

    const byId = new Map(polygons.map((p) => [p.id, p]))
    for (const id of TRYON_DRAW_ORDER) {
      const poly = byId.get(id)
      if (!poly || poly.points.length < 3) continue
      const zoneLayer = layers[poly.zoneId]
      if (!zoneLayer?.product || zoneLayer.intensity <= 0.01) continue

      const alpha = TRYON_BASE_ALPHA[poly.zoneId] * zoneLayer.intensity
      if (alpha <= 0.01) continue

      const hex = zoneLayer.product.shadeHex
      lctx.save()
      lctx.globalCompositeOperation = TRYON_BLEND[poly.zoneId]
      lctx.globalAlpha = alpha
      lctx.fillStyle = hex
      lctx.shadowColor = hex
      lctx.shadowBlur = Math.max(8, Math.min(width, height) * 0.018)
      pathPolygon(lctx, poly.points, width, height)
      lctx.fill()
      lctx.restore()
    }

    ctx.drawImage(layer, 0, 0)

    for (const poly of activePolygons) {
      ctx.save()
      ctx.strokeStyle = 'rgba(255, 248, 243, 0.95)'
      ctx.lineWidth = 2.5
      ctx.setLineDash([])
      pathPolygon(ctx, poly.points, width, height)
      ctx.stroke()
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
  }, [imageReady, polygons, layers, activePolygons])

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
      poly.points[drag.pointIndex] = norm
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
              onClick={() => setActiveZone(tab.zoneId)}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <div className="tryon-zone-panel">
        {recommended && activeLayer.product ? (
          <ProductCard
            product={recommended}
            catalog={catalog}
            selected={activeLayer.product}
            onSelectedChange={(product) => updateActiveLayer({ product })}
          />
        ) : (
          <p className="zone-empty">{t('results.emptyZone')}</p>
        )}

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

        <div className="tryon-zone-actions">
          <button
            type="button"
            className="tryon-chip"
            onClick={resetActivePolygons}
          >
            {t('tryon.reset')}
          </button>
        </div>

        <p className="tryon-hint">{t('tryon.hintZone')}</p>
      </div>
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
