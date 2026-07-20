import { useEffect, useMemo, useRef, useState } from 'react'
import { CameraStage } from './components/CameraStage'
import { ResultsPanel } from './components/ResultsPanel'
import { getActiveCatalog } from './data/catalog'
import { analyzeCapturedImage } from './lib/analyzeFace'
import { matchProducts } from './lib/matchProducts'
import type { AppPhase, ProductMatch, SkinProfile } from './types'
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

export default function App() {
  const [phase, setPhase] = useState<AppPhase>('idle')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [profile, setProfile] = useState<SkinProfile | null>(null)
  const [matches, setMatches] = useState<ProductMatch[]>([])
  const [analyzingLabel, setAnalyzingLabel] = useState('Analiziram ton kože…')
  const analysisIdRef = useRef(0)

  const catalog = useMemo(() => getActiveCatalog(), [])

  function resetToLanding() {
    analysisIdRef.current += 1
    setProfile(null)
    setMatches([])
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
        setMatches([])
        setPhotoUrl(null)
        setPhase('camera')
        return
      }
      // Back from results (or unknown) → landing
      resetToLanding()
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  function startCamera() {
    setPhase('camera')
    writeHistory('camera', 'push')
  }

  function handleCapture(canvas: HTMLCanvasElement) {
    const analysisId = ++analysisIdRef.current
    setPhase('analyzing')
    setAnalyzingLabel('Detektujem lice…')
    setPhotoUrl(canvas.toDataURL('image/jpeg', 0.92))

    void (async () => {
      try {
        setAnalyzingLabel('Merim jagodice, čelo i vilicu…')
        const skin = await analyzeCapturedImage(canvas)
        if (analysisId !== analysisIdRef.current) return

        const { top } = matchProducts(catalog.products, skin, {
          perCategory: 2,
          overallLimit: 12,
        })
        setProfile(skin)
        setMatches(top)
        setPhase('results')
        // Replace camera entry so Back skips camera and returns to landing
        writeHistory('results', 'replace')
      } catch {
        if (analysisId !== analysisIdRef.current) return
        setPhase('camera')
      }
    })()
  }

  function retake() {
    analysisIdRef.current += 1
    setProfile(null)
    setMatches([])
    setPhotoUrl(null)
    setPhase('camera')
    writeHistory('camera', 'replace')
  }

  return (
    <div className={`app phase-${phase}`}>
      <div className="atmosphere" aria-hidden="true" />

      {phase === 'idle' && (
        <section className="landing">
          <header className="brand-block">
            <p className="brand">Lilly</p>
            <h1>Pronađi sminku koja odgovara tvom tonu.</h1>
            <p className="lead">
              Uključi kameru, uslikaj se i dobij preporuke po boji kože sa
              jagodica, čela i vilice.
            </p>
            <button type="button" className="btn-primary" onClick={startCamera}>
              Otvori kameru
            </button>
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

      {phase === 'results' && photoUrl && profile && (
        <ResultsPanel
          photoUrl={photoUrl}
          profile={profile}
          matches={matches}
          usingDemo={catalog.usingDemo}
          onRetake={retake}
        />
      )}
    </div>
  )
}
