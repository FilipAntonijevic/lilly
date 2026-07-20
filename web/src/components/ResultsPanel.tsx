import type { ProductMatch, SkinProfile } from '../types'
import { categoryLabel } from '../lib/matchProducts'
import { depthLabel, hairLabel, undertoneLabel } from '../lib/labels'

interface ResultsPanelProps {
  photoUrl: string
  profile: SkinProfile
  matches: ProductMatch[]
  usingDemo: boolean
  onRetake: () => void
}

export function ResultsPanel({
  photoUrl,
  profile,
  matches,
  usingDemo,
  onRetake,
}: ResultsPanelProps) {
  const byCategory = matches.reduce<Record<string, ProductMatch[]>>((acc, m) => {
    const key = m.product.category
    ;(acc[key] ??= []).push(m)
    return acc
  }, {})

  return (
    <section className="results" aria-live="polite">
      <div className="results-hero">
        <img src={photoUrl} alt="Tvoj snimak" className="results-photo" />
        <div className="results-profile">
          <p className="eyebrow">Analiza lica</p>
          <h2>Tvoj ton</h2>
          <p className="mesh-status">
            {profile.usedFaceMesh
              ? 'Face mesh: detektovani regioni (jagodice, čelo, vilica…)'
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
              <p className="eyebrow">Regioni</p>
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
        <p className="eyebrow">Preporuke</p>
        <h2>Najbolji match</h2>
        {usingDemo ? (
          <p className="demo-banner">
            Katalog prodavnice je još prazan — prikazan je demo katalog da vidiš
            kako matching radi.
          </p>
        ) : (
          <p className="demo-banner">
            Preporuke iz dm.rs kataloga (nijansa + hex boja). Pokreni{' '}
            <code>npm run scrape:dm</code> za osvežavanje.
          </p>
        )}

        {!matches.length ? (
          <p className="empty-catalog">
            Nema proizvoda u bazi. Dodaj stavke u <code>src/data/products.json</code>{' '}
            i osveži aplikaciju.
          </p>
        ) : (
          <div className="match-groups">
            {Object.entries(byCategory).map(([category, items]) => (
              <div key={category} className="match-group">
                <h3>{categoryLabel(items[0].product.category)}</h3>
                <ul className="match-list">
                  {items.map(({ product, score, reasons }) => (
                    <li key={product.id} className="match-item">
                      <span
                        className="product-swatch"
                        style={{ background: product.shadeHex }}
                        aria-hidden="true"
                      />
                      <div className="match-meta">
                        <p className="product-name">{product.name}</p>
                        <p className="product-brand">
                          {product.brand}
                          {product.shadeName ? ` · nijansa ${product.shadeName}` : ''}
                          {product.shadeHex ? ` · ${product.shadeHex}` : ''}
                          {product.source === 'dm' ? ' · dm.rs' : ''}
                        </p>
                        <p className="product-reason">{reasons[0]}</p>
                        {product.url && (
                          <a
                            className="product-link"
                            href={product.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Otvori na dm.rs
                          </a>
                        )}
                      </div>
                      <span className="match-score">{Math.round(score)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
