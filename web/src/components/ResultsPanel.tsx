import type { FaceRegionId, FaceZoneMatch, SkinProfile } from '../types'
import { useLanguage } from '../i18n/LanguageContext'
import { isMessageKey, type MessageKey } from '../i18n/messages'
import {
  depthLabel,
  fitzpatrickLabel,
  hairLabel,
  hairTemperatureLabel,
  undertoneLabel,
} from '../lib/labels'
import { ProductCard } from './ProductCard'

interface ResultsPanelProps {
  photoUrl: string
  profile: SkinProfile
  routine: FaceZoneMatch[]
  usingDemo: boolean
  catalogCount: number
  onRetake: () => void
}

function regionMessageKey(id: FaceRegionId, bald: boolean): MessageKey {
  if (id === 'hair' && bald) return 'region.hairBald'
  const map: Record<FaceRegionId, MessageKey> = {
    forehead: 'region.forehead',
    leftCheek: 'region.leftCheek',
    rightCheek: 'region.rightCheek',
    jaw: 'region.jaw',
    underEye: 'region.underEye',
    hair: 'region.hair',
  }
  return map[id]
}

function tx(
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
  value: string,
): string {
  return isMessageKey(value) ? t(value) : value
}

export function ResultsPanel({
  photoUrl,
  profile,
  routine,
  usingDemo,
  catalogCount,
  onRetake,
}: ResultsPanelProps) {
  const { locale, t } = useLanguage()

  return (
    <section className="results" aria-live="polite">
      <div className="results-hero">
        <img src={photoUrl} alt={t('results.photoAlt')} className="results-photo" />
        <div className="results-profile">
          <p className="eyebrow">{t('results.eyebrow')}</p>
          <h2>{t('results.title')}</h2>
          <p className="mesh-status">
            {profile.usedFaceMesh ? t('results.meshOk') : t('results.meshFallback')}
          </p>
          <p className={`lighting-note quality-${profile.lighting.quality}`}>
            {t(profile.lighting.noteKey)}
          </p>
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
                {profile.hair.source.startsWith('ml') ? ' · ML' : ''}
              </strong>
            </li>
          </ul>

          {profile.regions.length > 0 && (
            <div className="region-block">
              <p className="eyebrow">{t('results.regions')}</p>
              <ul className="region-list">
                {profile.regions.map((region) => (
                  <li key={region.id} className="region-item">
                    <span
                      className="region-swatch"
                      style={{ background: region.hex }}
                      aria-hidden="true"
                    />
                    <span>
                      {t(regionMessageKey(region.id, profile.hair.bald))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button type="button" className="btn-secondary" onClick={onRetake}>
            {t('results.retake')}
          </button>
        </div>
      </div>

      <div className="results-matches">
        <p className="eyebrow">{t('results.routineEyebrow')}</p>
        <h2>{t('results.routineTitle')}</h2>
        {usingDemo ? (
          <p className="demo-banner">{t('results.demoBanner')}</p>
        ) : (
          <p className="demo-banner">
            {t('results.liveBanner', { count: catalogCount })}
          </p>
        )}

        <div className="zone-list">
          {routine.map((zone) => {
            const product = zone.match?.product
            const reasonKey = zone.match?.reasons[0]
            return (
              <article key={zone.zoneId} className="zone-card">
                <header className="zone-head">
                  <div>
                    <p className="zone-label">{tx(t, zone.zoneLabel)}</p>
                    <p className="zone-target">{tx(t, zone.faceTarget)}</p>
                  </div>
                  {zone.match && (
                    <span className="match-score">
                      {Math.round(zone.match.score)}%
                    </span>
                  )}
                </header>
                <p className="zone-tip">{tx(t, zone.tip)}</p>

                {product ? (
                  <ProductCard
                    product={product}
                    reason={
                      reasonKey
                        ? isMessageKey(reasonKey)
                          ? t(reasonKey)
                          : reasonKey
                        : undefined
                    }
                  />
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
