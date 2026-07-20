import { useMemo, useState } from 'react'
import { CameraStage } from './components/CameraStage'
import { ResultsPanel } from './components/ResultsPanel'
import { getActiveCatalog } from './data/catalog'
import { analyzeCapturedImage } from './lib/analyzeFace'
import { matchProducts } from './lib/matchProducts'
import type { AppPhase, ProductMatch, SkinProfile } from './types'
import './App.css'

export default function App() {
  const [phase, setPhase] = useState<AppPhase>('idle')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [profile, setProfile] = useState<SkinProfile | null>(null)
  const [matches, setMatches] = useState<ProductMatch[]>([])

  const catalog = useMemo(() => getActiveCatalog(), [])

  function startCamera() {
    setPhase('camera')
  }

  function handleCapture(canvas: HTMLCanvasElement) {
    setPhase('analyzing')
    setPhotoUrl(canvas.toDataURL('image/jpeg', 0.92))

    // Short delay so UI can show analyzing state
    window.setTimeout(() => {
      try {
        const skin = analyzeCapturedImage(canvas)
        const { top } = matchProducts(catalog.products, skin, {
          perCategory: 2,
          overallLimit: 12,
        })
        setProfile(skin)
        setMatches(top)
        setPhase('results')
      } catch {
        setPhase('camera')
      }
    }, 650)
  }

  function retake() {
    setProfile(null)
    setMatches([])
    setPhotoUrl(null)
    setPhase('camera')
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
              Uključi kameru, uslikaj se i dobij preporuke po boji kože i
              undertone-u.
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
              <p className="analyzing-label">Analiziram ton kože…</p>
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
