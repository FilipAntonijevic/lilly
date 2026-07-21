import type { FaceZoneMatch, MakeupProduct, SkinProfile } from '../types'
import { useLanguage } from '../i18n/LanguageContext'
import { isMessageKey } from '../i18n/messages'
import {
  depthLabel,
  fitzpatrickLabel,
  hairLabel,
  hairTemperatureLabel,
  undertoneLabel,
} from '../lib/labels'
import { MakeupTryOn } from './MakeupTryOn'
import { ProductCard } from './ProductCard'

interface ResultsPanelProps {
  photoUrl: string
  profile: SkinProfile
  routine: FaceZoneMatch[]
  catalog: MakeupProduct[]
  onRetake: () => void
}

export function ResultsPanel({
  photoUrl,
  profile,
  routine,
  catalog,
  onRetake,
}: ResultsPanelProps) {
  const { locale, t } = useLanguage()
  const landmarks = profile.landmarks
  const canTryOn = Boolean(landmarks && landmarks.length >= 100)

  return (
    <section className="results" aria-live="polite">
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

      <div className="results-profile">
        <p className="eyebrow">{t('results.eyebrow')}</p>
        <h2>{t('results.title')}</h2>
        <div className="swatch-row">
          <span
            className="swatch"
            style={{ background: profile.hex }}
            title={t('results.skin')}
          />
          <span
            className="swatch"
            style={{ background: profile.hair.hex }}
            title={t('results.hairSwatch')}
          />
        </div>
        <ul className="profile-list">
          <li>
            <span>{t('results.depth')}</span>
            <strong>{depthLabel(profile.depth, locale)}</strong>
          </li>
          <li>
            <span>{t('results.fitzpatrick')}</span>
            <strong>{fitzpatrickLabel(profile.fitzpatrick, locale)}</strong>
          </li>
          <li>
            <span>{t('results.undertone')}</span>
            <strong>{undertoneLabel(profile.undertone, locale)}</strong>
          </li>
          <li>
            <span>{t('results.ita')}</span>
            <strong>{profile.ita.toFixed(1)}°</strong>
          </li>
          <li>
            <span>{t('results.hair')}</span>
            <strong>
              {profile.hair.bald
                ? t('results.bald')
                : `${hairLabel(profile.hair.family, locale)} · ${hairTemperatureLabel(profile.hair.temperature, locale)}`}
            </strong>
          </li>
        </ul>
        <button type="button" className="btn-secondary" onClick={onRetake}>
          {t('results.retake')}
        </button>
      </div>

      <div className="results-matches">
        <h2>{t('results.productsTitle')}</h2>
        <div className="product-stack">
          {routine.map((zone) => {
            const product = zone.match?.product
            const categoryLabel = isMessageKey(zone.zoneLabel)
              ? t(zone.zoneLabel)
              : zone.zoneLabel
            return (
              <article key={zone.zoneId} className="product-stack-item">
                <p className="product-stack-category">{categoryLabel}</p>
                {product ? (
                  <ProductCard product={product} catalog={catalog} />
                ) : (
                  <p className="zone-empty">{t('results.emptyZone')}</p>
                )}
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
