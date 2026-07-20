import type { FaceZoneMatch, SkinProfile } from '../types'
import { depthLabel, hairLabel, undertoneLabel } from '../lib/labels'

interface ResultsPanelProps {
  photoUrl: string
  profile: SkinProfile
  routine: FaceZoneMatch[]
  usingDemo: boolean
  catalogCount: number
  onRetake: () => void
}

function formatPriceRsd(price?: number): string | null {
  if (typeof price !== 'number' || Number.isNaN(price)) return null
  return (
    new Intl.NumberFormat('sr-RS', {
      maximumFractionDigits: 0,
    }).format(price) + ' RSD'
  )
}

export function ResultsPanel({
  photoUrl,
  profile,
  routine,
  usingDemo,
  catalogCount,
  onRetake,
}: ResultsPanelProps) {
  return (
    <section className="results" aria-live="polite">
      <div className="results-hero">
        <img src={photoUrl} alt="Tvoj snimak" className="results-photo" />
        <div className="results-profile">
          <p className="eyebrow">Analiza lica</p>
          <h2>Tvoj ton</h2>
          <p className="mesh-status">
            {profile.usedFaceMesh
              ? 'Face mesh: regioni mapirani na sminku (jagodice, čelo, vilica…)'
              : 'Face mesh nije detektovao lice — korišćen je rezervni režim'}
          </p>
          <p className={`lighting-note quality-${profile.lighting.quality}`}>
            {profile.lighting.note}
          </p>
          <div className="swatch-row">
            <span className="swatch" style={{ background: profile.hex }} title="Koža" />
            <span
              className="swatch"
              style={{ background: profile.hair.hex }}
              title="Kosa"
            />
          </div>
          <ul className="profile-list">
            <li>
              <span>Dubina tena</span>
              <strong>{depthLabel(profile.depth)}</strong>
            </li>
            <li>
              <span>Undertone</span>
              <strong>{undertoneLabel(profile.undertone)}</strong>
            </li>
            <li>
              <span>ITA</span>
              <strong>{profile.ita.toFixed(1)}°</strong>
            </li>
            <li>
              <span>Kosa</span>
              <strong>
                {hairLabel(profile.hair.family)} · {profile.hair.temperature}
              </strong>
            </li>
          </ul>

          {profile.regions.length > 0 && (
            <div className="region-block">
              <p className="eyebrow">Izmereni regioni</p>
              <ul className="region-list">
                {profile.regions.map((region) => (
                  <li key={region.id} className="region-item">
                    <span
                      className="region-swatch"
                      style={{ background: region.hex }}
                      aria-hidden="true"
                    />
                    <span>{region.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button type="button" className="btn-secondary" onClick={onRetake}>
            Nova slika
          </button>
        </div>
      </div>

      <div className="results-matches">
        <p className="eyebrow">Rutina šminkanja</p>
        <h2>Po jedan proizvod po zoni lica</h2>
        {usingDemo ? (
          <p className="demo-banner">
            Demo katalog — dm.rs baza nije učitana.
          </p>
        ) : (
          <p className="demo-banner">
            Preporuke iz dm.rs kataloga ({catalogCount} artikala). Svaka zona =
            najbolji match za taj deo lica.
          </p>
        )}

        <div className="zone-list">
          {routine.map((zone) => {
            const product = zone.match?.product
            return (
              <article key={zone.zoneId} className="zone-card">
                <header className="zone-head">
                  <div>
                    <p className="zone-label">{zone.zoneLabel}</p>
                    <p className="zone-target">{zone.faceTarget}</p>
                  </div>
                  {zone.match && (
                    <span className="match-score">
                      {Math.round(zone.match.score)}%
                    </span>
                  )}
                </header>
                <p className="zone-tip">{zone.tip}</p>

                {product ? (
                  <a
                    className="zone-product-card"
                    href={product.url || undefined}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${product.name} na dm.rs`}
                  >
                    <div className="product-media">
                      {product.imageUrl ? (
                        <img
                          className="product-image"
                          src={product.imageUrl}
                          alt={product.name}
                          loading="lazy"
                        />
                      ) : (
                        <span
                          className="product-swatch large"
                          style={{ background: product.shadeHex }}
                          aria-hidden="true"
                        />
                      )}
                      <span
                        className="shade-dot"
                        style={{ background: product.shadeHex }}
                        title={product.shadeHex}
                        aria-hidden="true"
                      />
                    </div>
                    <div className="match-meta">
                      <p className="product-name">{product.name}</p>
                      <p className="product-brand">
                        {product.brand}
                        {product.shadeName ? ` · nijansa ${product.shadeName}` : ''}
                      </p>
                      {formatPriceRsd(product.priceRsd) && (
                        <p className="product-price">
                          {formatPriceRsd(product.priceRsd)}
                        </p>
                      )}
                      <p className="product-reason">
                        {zone.match?.reasons[0]}
                      </p>
                      <span className="product-link">Pogledaj na dm.rs →</span>
                    </div>
                  </a>
                ) : (
                  <p className="zone-empty">Nema proizvoda u ovoj kategoriji.</p>
                )}
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
