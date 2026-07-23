/**
 * Build Lilly catalog from DM products: for each DM item, look up the same
 * product on lilly.rs (GTIN / barcode first) and keep Lilly price + URL + SKU.
 *
 * Usage: node scripts/scrape-lilly-from-dm.mjs
 * Output: src/data/lilly/products.json (+ lilly-raw.json debug)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DM_CATALOG = join(__dirname, '../src/data/dm/products.json')
const OUT_DIR = join(__dirname, '../src/data/lilly')
const PUBLIC_DIR = join(__dirname, '../public')

const SEARCH = 'https://www.lilly.rs/rest/V1/search'
const RENDER = 'https://www.lilly.rs/rest/V1/products-render-info'
const DELAY_MS = 180
const RENDER_BATCH = 25
const MAX_RETRIES = 5

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchJson(url, init = {}, attempt = 1) {
  const r = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36',
      ...(init.headers || {}),
    },
  })
  if (!r.ok) {
    if ((r.status === 429 || r.status >= 500) && attempt < MAX_RETRIES) {
      await sleep(800 * attempt)
      return fetchJson(url, init, attempt + 1)
    }
    const body = await r.text()
    throw new Error(`HTTP ${r.status} ${url} — ${body.slice(0, 160)}`)
  }
  return r.json()
}

async function searchIds(term) {
  const u = new URL(SEARCH)
  u.searchParams.set('searchCriteria[requestName]', 'quick_search_container')
  u.searchParams.set(
    'searchCriteria[filterGroups][0][filters][0][field]',
    'search_term',
  )
  u.searchParams.set(
    'searchCriteria[filterGroups][0][filters][0][value]',
    term,
  )
  u.searchParams.set('searchCriteria[pageSize]', '8')
  const data = await fetchJson(u)
  return (data.items || []).map((it) => Number(it.id)).filter(Boolean)
}

async function renderInfos(entityIds) {
  if (!entityIds.length) return []
  const out = []
  for (let i = 0; i < entityIds.length; i += RENDER_BATCH) {
    const chunk = entityIds.slice(i, i + RENDER_BATCH)
    const u = new URL(RENDER)
    u.searchParams.set('storeId', '1')
    u.searchParams.set('currencyCode', 'RSD')
    u.searchParams.set(
      'searchCriteria[filterGroups][0][filters][0][field]',
      'entity_id',
    )
    u.searchParams.set(
      'searchCriteria[filterGroups][0][filters][0][value]',
      chunk.join(','),
    )
    u.searchParams.set(
      'searchCriteria[filterGroups][0][filters][0][condition_type]',
      'in',
    )
    const data = await fetchJson(u)
    out.push(...(data.items || []))
    if (i + RENDER_BATCH < entityIds.length) await sleep(DELAY_MS)
  }
  return out
}

function skuFromUrl(url) {
  if (!url) return undefined
  const m = String(url).match(/-(\d+)\/?$/)
  return m?.[1]
}

function imageHasGtin(item, gtin) {
  if (!gtin) return false
  const images = item.images || []
  return images.some((img) => String(img.url || '').includes(gtin))
}

function pickImage(item) {
  const images = item.images || []
  const preferred =
    images.find((i) => i.code?.includes('list')) ||
    images.find((i) => i.code?.includes('grid')) ||
    images[0]
  return preferred?.url
}

function scoreNameMatch(dm, lillyName) {
  const a = `${dm.brand || ''} ${dm.name || ''} ${dm.shadeName || ''}`.toLowerCase()
  const b = String(lillyName || '').toLowerCase()
  if (!b) return 0
  let score = 0
  const brand = String(dm.brand || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  if (brand && b.includes(brand.split(' ')[0])) score += 2
  const shade = String(dm.shadeName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  if (shade) {
    const shadeTok = shade.split(/\s+/)[0]
    if (shadeTok && b.includes(shadeTok)) score += 3
  }
  // Shared significant tokens
  const tokens = a
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 3)
  for (const t of tokens) {
    if (b.includes(t)) score += 1
  }
  return score
}

function shadeCode(shadeName) {
  const m = String(shadeName || '').trim().match(/\d+[a-z]?/i)
  return m?.[0]?.toLowerCase() || ''
}

function hasShadeCode(hay, code) {
  if (!code) return true
  const h = String(hay || '').toLowerCase()
  if (h.includes(code)) return true
  // Lilly often zero-pads (30 → 030)
  if (/^\d+$/.test(code) && h.includes(code.padStart(3, '0'))) return true
  return false
}

function pickMatch(dm, candidates) {
  if (!candidates.length) return null
  const gtin = dm.gtin ? String(dm.gtin) : ''

  const byGtin = candidates.filter((c) => imageHasGtin(c, gtin))
  if (byGtin.length === 1) return byGtin[0]
  if (byGtin.length > 1) {
    return byGtin.sort(
      (a, b) => scoreNameMatch(dm, b.name) - scoreNameMatch(dm, a.name),
    )[0]
  }

  // No barcode proof — require shade code in Lilly name/URL + strong name score.
  const code = shadeCode(dm.shadeName)
  const ranked = candidates
    .filter((c) => hasShadeCode(`${c.name} ${c.url}`, code))
    .map((c) => ({ c, score: scoreNameMatch(dm, c.name) }))
    .filter((x) => x.score >= 5)
    .sort((a, b) => b.score - a.score)
  const best = ranked[0]
  if (
    best &&
    (!ranked[1] || best.score >= ranked[1].score + 2)
  ) {
    return best.c
  }
  return null
}

function toLillyProduct(dm, match) {
  const sku = skuFromUrl(match.url)
  const price = match.price_info?.final_price
  return {
    id: `lilly-${sku || match.id}`,
    name: dm.name,
    brand: dm.brand,
    category: dm.category,
    shadeHex: dm.shadeHex,
    shadeName: dm.shadeName,
    undertone: dm.undertone,
    depthMin: dm.depthMin,
    depthMax: dm.depthMax,
    paletteTags: dm.paletteTags,
    url: match.url,
    imageUrl: pickImage(match) || dm.imageUrl,
    priceRsd: typeof price === 'number' ? Math.round(price) : dm.priceRsd,
    gtin: dm.gtin,
    sku: sku || undefined,
    lillyEntityId: match.id,
    source: 'lilly',
    dmId: dm.id,
  }
}

async function searchTerms(terms) {
  const tried = new Set()
  const ids = []
  for (const term of terms) {
    if (!term || tried.has(term)) continue
    tried.add(term)
    try {
      const found = await searchIds(term)
      for (const id of found) {
        if (!ids.includes(id)) ids.push(id)
      }
    } catch (err) {
      console.warn(`  search fail (${term}):`, err.message)
    }
    await sleep(DELAY_MS)
  }
  return ids
}

function fallbackTerms(dm) {
  const shade = dm.shadeName ? String(dm.shadeName).split(',')[0].trim() : ''
  const terms = []
  if (dm.brand && shade) terms.push(`${dm.brand} ${shade}`)
  if (dm.brand && dm.name) {
    const shortName = String(dm.name)
      .split('—')[0]
      .split('-')[0]
      .trim()
    terms.push(`${dm.brand} ${shortName} ${shade}`.trim())
  }
  return terms
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const allDm = JSON.parse(readFileSync(DM_CATALOG, 'utf8'))
  const limitArg = process.argv.find((a) => a.startsWith('--limit='))
  const limit = limitArg ? Number(limitArg.split('=')[1]) : 0
  const dmProducts = limit > 0 ? allDm.slice(0, limit) : allDm
  console.log(`DM products: ${dmProducts.length}${limit ? ` (limit ${limit})` : ''}`)

  const matched = []
  const misses = []
  const raw = []

  // Cache render-info by entity id across the run
  const renderCache = new Map()

  for (let i = 0; i < dmProducts.length; i++) {
    const dm = dmProducts[i]
    process.stdout.write(
      `\r[${i + 1}/${dmProducts.length}] ${dm.gtin || dm.id}   `,
    )

    const ensureRendered = async (entityIds) => {
      const missing = entityIds.filter((id) => !renderCache.has(id))
      if (!missing.length) return
      try {
        const infos = await renderInfos(missing)
        for (const info of infos) renderCache.set(info.id, info)
        await sleep(DELAY_MS)
      } catch (err) {
        console.warn(`\n  render fail:`, err.message)
      }
    }

    let entityIds = dm.gtin ? await searchTerms([String(dm.gtin)]) : []
    await ensureRendered(entityIds)
    let candidates = entityIds.map((id) => renderCache.get(id)).filter(Boolean)
    let match = pickMatch(dm, candidates)

    if (!match) {
      const more = await searchTerms(fallbackTerms(dm))
      for (const id of more) {
        if (!entityIds.includes(id)) entityIds.push(id)
      }
      await ensureRendered(entityIds)
      candidates = entityIds.map((id) => renderCache.get(id)).filter(Boolean)
      match = pickMatch(dm, candidates)
    }

    if (!match || match.is_salable === '0') {
      misses.push({ id: dm.id, gtin: dm.gtin, name: dm.name })
      raw.push({ dmId: dm.id, gtin: dm.gtin, entityIds, match: null })
      continue
    }

    const product = toLillyProduct(dm, match)
    matched.push(product)
    raw.push({
      dmId: dm.id,
      gtin: dm.gtin,
      entityIds,
      match: {
        id: match.id,
        sku: product.sku,
        url: product.url,
        priceRsd: product.priceRsd,
        name: match.name,
      },
    })
  }

  console.log('\n')
  writeFileSync(join(OUT_DIR, 'products.json'), JSON.stringify(matched, null, 2), 'utf8')
  writeFileSync(join(OUT_DIR, 'lilly-raw.json'), JSON.stringify(raw, null, 2), 'utf8')
  writeFileSync(
    join(PUBLIC_DIR, 'lilly-products.json'),
    JSON.stringify(matched, null, 2),
    'utf8',
  )

  console.log('Matched:', matched.length)
  console.log('Missing on Lilly:', misses.length)
  console.log('Wrote src/data/lilly/products.json')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
