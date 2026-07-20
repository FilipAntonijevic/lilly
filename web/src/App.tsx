import { useEffect, useRef, useState } from 'react'
import { CameraStage } from './components/CameraStage'
import { LanguageToggle } from './components/LanguageToggle'
import { ResultsPanel } from './components/ResultsPanel'
import { loadActiveCatalog } from './data/catalog'
import { useLanguage } from './i18n/LanguageContext'
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
  const { t } = useLanguage()
  const [phase, setPhase] = useState<AppPhase>('idle')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [profile, setProfile] = useState<SkinProfile | null>(null)
  const [routine, setRoutine] = useState<FaceZoneMatch[]>([])
  const [analyzingLabel, setAnalyzingLabel] = useState('')
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
    setAnalyzingLabel(t('analyze.detectFace'))
    setPhotoUrl(mainDataUrl)

    void (async () => {
      try {
        setAnalyzingLabel(t('analyze.measure'))
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

        setAnalyzingLabel(t('analyze.pickProducts'))
        const active = catalog ?? (await loadActiveCatalog())
        if (!catalog) setCatalog(active)

        const zones = buildFaceRoutine(active.products, skin)
        setProfile(skin)
        setRoutine(zones)
        setPhase('results')
        writeHistory('results', 'replace')
      } catch {
        if (analysisId !== analysisIdRef.current) return
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
        accept="image/jpeg,image/png,image/webp,image/*"
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
          <LanguageToggle className="lang-toggle-landing" />
          <header className="landing-top">
            <p className="brand">Lilly</p>
            <h1>{t('landing.headline')}</h1>
            <p className="lead">{t('landing.lead')}</p>
          </header>
          <footer className="landing-bottom">
            <div className="cta-group">
              <button
                type="button"
                className="cta-tile cta-tile-primary"
                onClick={startCamera}
              >
                <svg
                  className="cta-tile-icon"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 8.5h2.2l1.3-2.2h9l1.3 2.2H20a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 20 19.5H4A1.5 1.5 0 0 1 2.5 18v-8A1.5 1.5 0 0 1 4 8.5Z" />
                  <circle cx="12" cy="13.5" r="3.25" />
                </svg>
                <span>{t('landing.takeSelfie')}</span>
              </button>
              <button
                type="button"
                className="cta-tile cta-tile-secondary"
                onClick={openUploadPicker}
              >
                <svg
                  className="cta-tile-icon"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 15.5V4.5" />
                  <path d="m8 8 4-3.5L16 8" />
                  <path d="M4.5 14.5v3A2 2 0 0 0 6.5 19.5h11a2 2 0 0 0 2-2v-3" />
                </svg>
                <span>{t('landing.uploadSelfie')}</span>
              </button>
            </div>
          </footer>
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
        <>
          <LanguageToggle className="lang-toggle-results" />
          <ResultsPanel
            photoUrl={photoUrl}
            profile={profile}
            routine={routine}
            catalog={catalog.products}
            onRetake={retake}
          />
        </>
      )}
    </div>
  )
}
