import { useLanguage } from '../i18n/LanguageContext'
import type {
  FaceLandmarkPoint,
  FaceZoneMatch,
  MakeupProduct,
} from '../types'
import { MakeupTryOn } from './MakeupTryOn'

interface TryOnPanelProps {
  photoUrl: string
  landmarks: FaceLandmarkPoint[] | undefined
  routine: FaceZoneMatch[]
  catalog: MakeupProduct[]
  onBack: () => void
}

export function TryOnPanel({
  photoUrl,
  landmarks,
  routine,
  catalog,
  onBack,
}: TryOnPanelProps) {
  const { t } = useLanguage()
  const canTryOn = Boolean(landmarks && landmarks.length >= 100)

  return (
    <section className="tryon-screen" aria-live="polite">
      {canTryOn && landmarks ? (
        <MakeupTryOn
          photoUrl={photoUrl}
          landmarks={landmarks}
          routine={routine}
          catalog={catalog}
          onBack={onBack}
        />
      ) : (
        <>
          <div className="tryon-fallback-stage">
            <button
              type="button"
              className="tryon-back-overlay"
              onClick={onBack}
            >
              {t('tryon.back')}
            </button>
            <img
              src={photoUrl}
              alt={t('results.photoAlt')}
              className="results-photo"
            />
          </div>
          <p className="tryon-fallback">{t('tryon.unavailable')}</p>
        </>
      )}
    </section>
  )
}
