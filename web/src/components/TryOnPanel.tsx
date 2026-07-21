import { useLanguage } from '../i18n/LanguageContext'
import type { FaceLandmarkPoint, FaceZoneMatch } from '../types'
import { MakeupTryOn } from './MakeupTryOn'

interface TryOnPanelProps {
  photoUrl: string
  landmarks: FaceLandmarkPoint[] | undefined
  routine: FaceZoneMatch[]
  onBack: () => void
}

export function TryOnPanel({
  photoUrl,
  landmarks,
  routine,
  onBack,
}: TryOnPanelProps) {
  const { t } = useLanguage()
  const canTryOn = Boolean(landmarks && landmarks.length >= 100)

  return (
    <section className="tryon-screen" aria-live="polite">
      <header className="tryon-screen-top">
        <button type="button" className="btn-secondary tryon-back" onClick={onBack}>
          {t('tryon.back')}
        </button>
        <div className="tryon-screen-heading">
          <p className="eyebrow">{t('tryon.eyebrow')}</p>
          <h2>{t('tryon.title')}</h2>
        </div>
      </header>

      {canTryOn && landmarks ? (
        <MakeupTryOn
          photoUrl={photoUrl}
          landmarks={landmarks}
          routine={routine}
        />
      ) : (
        <>
          <img
            src={photoUrl}
            alt={t('results.photoAlt')}
            className="results-photo"
          />
          <p className="tryon-fallback">{t('tryon.unavailable')}</p>
        </>
      )}
    </section>
  )
}
