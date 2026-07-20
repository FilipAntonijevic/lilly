import { useEffect, useRef, useState } from 'react'
import { CameraStage } from './components/CameraStage'
import { ResultsPanel } from './components/ResultsPanel'
import { loadActiveCatalog } from './data/catalog'
import { analyzeCapturedImage } from './lib/analyzeFace'
import { uploadCaptureBundle } from './lib/calibrationUpload'
import { preloadHairMl } from './lib/hairMl'
import { buildFaceRoutine } from './lib/faceRoutine'
import type {
  AppPhase,
  CaptureBundle,
  FaceZoneMatch,
  MakeupProduct,
  SkinProfile,
} from './types'
import './App.css'

type HistoryPhase = 'idle' | 'camera' | 'results'

function writeHistory(phase: HistoryPhase, mode: 'push' | 'replace') {
  const hash = phase === 'idle' ? '' : `#${phase}`
  const url = `${window.location.pathname}${window.location.search}${hash}`
  const state = { phase }
  if (mode === 'push') {
    window.history.pushState(state, '', url)
  } else {
    window.history.replaceState(state, '', url)
  }
}

async function imageFileToCanvas(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file)
  const maxSide = 1280
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new Error('Canvas 2D context unavailable')
  }
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return canvas
}

export default function App() {
  const [phase, setPhase] = useState<AppPhase>('idle')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [profile, setProfile] = useState<SkinProfile | null>(null)
  const [routine, setRoutine] = useState<FaceZoneMatch[]>([])
  const [analyzingLabel, setAnalyzingLabel] = useState('Analiziram ton kože…')
  const [catalog, setCatalog] = useState<{
    products: MakeupProduct[]
    usingDemo: boolean
  } | null>(null)
  const analysisIdRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void loadActiveCatalog().then(setCatalog)
    preloadHairMl()
  }, [])

  function resetToLanding() {
    analysisIdRef.current += 1
    setProfile(null)
    setRoutine([])
    setPhotoUrl(null)
    setPhase('idle')
  }

  useEffect(() => {
    writeHistory('idle', 'replace')

    function onPopState(event: PopStateEvent) {
      const next = (event.state?.phase as HistoryPhase | undefined) ?? 'idle'
      if (next === 'camera') {
        analysisIdRef.current += 1
        setProfile(null)
        setRoutine([])
        setPhotoUrl(null)
        setPhase('camera')
        return
      }
      resetToLanding()
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  function startCamera() {
    setPhase('camera')
    writeHistory('camera', 'push')
  }

  function openUploadPicker() {
    fileInputRef.current?.click()
  }

  async function handleUploadFile(file: File | undefined) {
    if (!file || !file.type.startsWith('image/')) return

    try {
      const canvas = await imageFileToCanvas(file)
      handleCapture({
        main: canvas,
        calibrationFrames: [],
      })
    } catch {
      /* stay on landing if decode fails */
    }
  }

  function handleCapture(bundle: CaptureBundle) {
    const analysisId = ++analysisIdRef.current
    const canvas = bundle.main
    const mainDataUrl = canvas.toDataURL('image/jpeg', 0.92)
    const capturedAt = Date.now()

    setPhase('analyzing')
    setAnalyzingLabel('Detektujem lice…')
    setPhotoUrl(mainDataUrl)

    void (async () => {
      try {
        setAnalyzingLabel('Merim regione lica i kosu…')
        const skin = await analyzeCapturedImage(canvas)
        if (analysisId !== analysisIdRef.current) return

        uploadCaptureBundle({
          mainDataUrl,
          calibrationFrames: bundle.calibrationFrames,
          capturedAt,
          userAgent: navigator.userAgent,
          analysis: {
            fitzpatrick: skin.fitzpatrick,
            undertone: skin.undertone,
            depth: skin.depth,
            ita: skin.ita,
            hair: skin.hair,
          },
        })

        setAnalyzingLabel('Biram proizvode po zonama…')
        const active = catalog ?? (await loadActiveCatalog())
        if (!catalog) setCatalog(active)

        const zones = buildFaceRoutine(active.products, skin)
        setProfile(skin)
        setRoutine(zones)
        setPhase('results')
        writeHistory('results', 'replace')
      } catch {
        if (analysisId !== analysisIdRef.current) return
        // Still persist frames even if analysis fails
        uploadCaptureBundle({
          mainDataUrl,
          calibrationFrames: bundle.calibrationFrames,
          capturedAt,
          userAgent: navigator.userAgent,
        })
        setPhase('idle')
      }
    })()
  }

  function retake() {
    analysisIdRef.current += 1
    setProfile(null)
    setRoutine([])
    setPhotoUrl(null)
    setPhase('idle')
    writeHistory('idle', 'replace')
  }

  return (
    <div className={`app phase-${phase}`}>
      <div className="atmosphere" aria-hidden="true" />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const input = e.currentTarget
          const file = input.files?.[0]
          input.value = ''
          void handleUploadFile(file)
        }}
      />

      {phase === 'idle' && (
        <section className="landing">
          <header className="brand-block">
            <p className="brand">Lilly</p>
            <h1>Pronađi sminku koja odgovara tvom tonu.</h1>
            <p className="lead">
              Uslikaj se ili otpremi selfie i dobij po jedan dm.rs proizvod za
              ten, ispod očiju, jagodice, konturu, usne i oči.
            </p>
            {catalog && !catalog.usingDemo && (
              <p className="catalog-count">
                Katalog: {catalog.products.length} artikala sa dm.rs
              </p>
            )}
            <div className="cta-group">
              <button type="button" className="btn-primary" onClick={startCamera}>
                Take a selfie
              </button>
              <button
                type="button"
                className="btn-secondary landing-secondary"
                onClick={openUploadPicker}
              >
                Upload a selfie
              </button>
            </div>
          </header>
        </section>
      )}

      {(phase === 'camera' || phase === 'analyzing') && (
        <section className="studio">
          <header className="studio-top">
            <p className="brand compact">Lilly</p>
            {phase === 'analyzing' && (
              <p className="analyzing-label">{analyzingLabel}</p>
            )}
          </header>
          <CameraStage
            onCapture={handleCapture}
            disabled={phase === 'analyzing'}
          />
        </section>
      )}

      {phase === 'results' && photoUrl && profile && catalog && (
        <ResultsPanel
          photoUrl={photoUrl}
          profile={profile}
          routine={routine}
          usingDemo={catalog.usingDemo}
          catalogCount={catalog.products.length}
          onRetake={retake}
        />
      )}
    </div>
  )
}
