import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import { useT } from '../i18n/LanguageContext'
import type { TryOnPolygonId } from '../lib/faceLandmarker'
import {
  TRYON_BASE_ALPHA,
  TRYON_BLEND,
  TRYON_DRAW_ORDER,
  buildTryOnPolygons,
  clonePolygons,
  shadeForZone,
  type EditableTryOnPolygon,
  type Point2D,
} from '../lib/tryOnRegions'
import type { FaceLandmarkPoint, FaceZoneMatch } from '../types'

interface MakeupTryOnProps {
  photoUrl: string
  landmarks: FaceLandmarkPoint[]
  routine: FaceZoneMatch[]
}

interface DragState {
  regionId: TryOnPolygonId
  pointIndex: number
}

const HANDLE_HIT_PX = 16

export function MakeupTryOn({ photoUrl, landmarks, routine }: MakeupTryOnProps) {
  const t = useT()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const [imageReady, setImageReady] = useState(false)
  const [polygons, setPolygons] = useState<EditableTryOnPolygon[]>(() =>
    buildTryOnPolygons(landmarks),
  )
  const [intensity, setIntensity] = useState(0.55)
  const [editMode, setEditMode] = useState(true)
  const [activeRegion, setActiveRegion] = useState<TryOnPolygonId>(
    polygons[0]?.id ?? 'lips',
  )
  const dragRef = useRef<DragState | null>(null)

  useEffect(() => {
    const next = buildTryOnPolygons(landmarks)
    setPolygons(next)
    if (next.length) setActiveRegion(next[0].id)
  }, [landmarks])

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
      const hex = shadeForZone(routine, poly.zoneId)
      if (!hex) continue

      const alpha = TRYON_BASE_ALPHA[poly.zoneId] * intensity
      if (alpha <= 0.01) continue

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

    if (!editMode) return

    for (const poly of polygons) {
      const isActive = poly.id === activeRegion
      ctx.save()
      ctx.strokeStyle = isActive
        ? 'rgba(255, 248, 243, 0.95)'
        : 'rgba(255, 248, 243, 0.28)'
      ctx.lineWidth = isActive ? 2.5 : 1.25
      ctx.setLineDash(isActive ? [] : [6, 5])
      pathPolygon(ctx, poly.points, width, height)
      ctx.stroke()
      ctx.restore()

      if (!isActive) continue
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
  }, [imageReady, polygons, intensity, editMode, activeRegion, routine])

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

    const active = polygons.find((p) => p.id === activeRegion)
    if (!active) return null

    let best: DragState | null = null
    let bestDist = Infinity
    active.points.forEach((point, pointIndex) => {
      const dx = (point.x - norm.x) / hitNormX
      const dy = (point.y - norm.y) / hitNormY
      const dist = dx * dx + dy * dy
      if (dist <= 1 && dist < bestDist) {
        bestDist = dist
        best = { regionId: active.id, pointIndex }
      }
    })
    return best
  }

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!editMode) return
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

  function resetPolygons() {
    setPolygons(buildTryOnPolygons(landmarks))
  }

  function onIntensityWheel(e: ReactWheelEvent<HTMLLabelElement>) {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.03 : 0.03
    setIntensity((v) => clamp01(v + delta))
  }

  const layersPct = Math.round(intensity * 100)

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

      <div className="tryon-controls">
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
            onChange={(e) => setIntensity(Number(e.target.value) / 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={layersPct}
            aria-label={t('tryon.intensity')}
          />
        </label>

        <div className="tryon-toolbar">
          <button
            type="button"
            className={`tryon-chip${editMode ? ' is-active' : ''}`}
            onClick={() => setEditMode((v) => !v)}
            aria-pressed={editMode}
          >
            {editMode ? t('tryon.editOn') : t('tryon.editOff')}
          </button>
          <button type="button" className="tryon-chip" onClick={resetPolygons}>
            {t('tryon.reset')}
          </button>
        </div>

        {editMode && (
          <div
            className="tryon-regions"
            role="listbox"
            aria-label={t('tryon.regions')}
          >
            {polygons.map((poly) => (
              <button
                key={poly.id}
                type="button"
                role="option"
                aria-selected={poly.id === activeRegion}
                className={`tryon-chip${poly.id === activeRegion ? ' is-active' : ''}`}
                onClick={() => setActiveRegion(poly.id)}
              >
                {t(poly.labelKey)}
              </button>
            ))}
          </div>
        )}

        <p className="tryon-hint">
          {editMode ? t('tryon.hintEdit') : t('tryon.hintView')}
        </p>
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
