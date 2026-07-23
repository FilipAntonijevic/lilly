/**
 * Scrape DM Srbija makeup products via their public product-search API.
 * Collects shade names + hex swatches for Lilly matching.
 *
 * Usage: node scripts/scrape-dm.mjs
 * Output: src/data/dm/products.json + src/data/dm/dm-raw.json
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '../src/data/dm')
const PUBLIC_DIR = join(__dirname, '../public')
const API = 'https://product-search.services.dmtech.com/rs/search'
const PAGE_SIZE = 30
const DELAY_MS = 3200
const MAX_RETRIES = 8

/** Targeted queries covering shade-relevant makeup on dm.rs */
const QUERIES = [
  { query: 'tečni puder', categoryHint: 'foundation' },
  { query: 'puder foundation', categoryHint: 'foundation' },
  { query: 'BB krema', categoryHint: 'foundation' },
  { query: 'CC krema', categoryHint: 'foundation' },
  { query: 'korektor', categoryHint: 'concealer' },
  { query: 'rumenilo', categoryHint: 'blush' },
  { query: 'bronzer', categoryHint: 'bronzer' },
  { query: 'konturisanje', categoryHint: 'bronzer' },
  { query: 'karmin', categoryHint: 'lipstick' },
  { query: 'ruž za usne', categoryHint: 'lipstick' },
  { query: 'tečni ruž', categoryHint: 'lipstick' },
  { query: 'senka za oči', categoryHint: 'eyeshadow' },
  { query: 'paleta senki', categoryHint: 'eyeshadow' },
]

const CATEGORY_KEYWORDS = {
  foundation: [
    'puder',
    'foundation',
    'podloga',
    'bb ',
    'cc ',
    'teint',
    'make up base',
    'makeup base',
  ],
  concealer: ['korektor', 'concealer', 'corrector'],
  // Prefer product-type phrases; "blush" alone matches shade names like "Blushed Stardust".
  blush: ['rumenilo', 'rouge'],
  bronzer: ['bronzer', 'kontur', 'contour', 'sculpt'],
  lipstick: ['karmin', 'ruž', 'lipstick', 'lip gloss', 'sjaj za usne', 'lip tint'],
  eyeshadow: ['senka za oč', 'senka za oc', 'eyeshadow', 'eyes shadow', 'paleta senki', 'senka'],
}

/** Check more specific / conflicting categories before generic keyword hits. */
const CATEGORY_INFER_ORDER = [
  'eyeshadow',
  'lipstick',
  'concealer',
  'bronzer',
  'foundation',
  'blush',
]

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchJson(url, attempt = 1) {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'LillyShadeMatcher/0.1 (+local research; contact via github.com/FilipAntonijevic/lilly)',
      Referer: 'https://www.dm.rs/',
      Origin: 'https://www.dm.rs',
    },
  })

  if (res.status === 429 || res.status >= 500) {
    if (attempt >= MAX_RETRIES) {
      throw new Error(`HTTP ${res.status} after ${MAX_RETRIES} retries: ${url}`)
    }
    const wait = DELAY_MS * attempt * 2
    console.warn(`  rate/limit ${res.status}, wait ${wait}ms…`)
    await sleep(wait)
    return fetchJson(url, attempt + 1)
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${url}`)
  }
  return res.json()
}

function inferCategory(title, dmCategories, hint) {
  const hay = `${title} ${(dmCategories || []).join(' ')}`.toLowerCase()

  // Word-boundary blush so "Blushed Stardust" eyeshadow is not classified as blush.
  if (/(^|[^a-z])blush([^a-z]|$)/i.test(hay) && !/senka|eyeshadow|paleta senki/.test(hay)) {
    return 'blush'
  }

  for (const cat of CATEGORY_INFER_ORDER) {
    const words = CATEGORY_KEYWORDS[cat] || []
    if (words.some((w) => hay.includes(w))) return cat
  }
  return hint || null
}

/** Extract shade label from DM titles like "… – 20 Velvet sand, 1 kom" or "… - 100, 1 kom" */
function parseShadeName(title, url = '') {
  if (!title) return null
  const cleaned = title
    .replace(/,?\s*\d+(?:[.,]\d+)?\s*ml\b.*$/i, '')
    .replace(/,?\s*\d+(?:[.,]\d+)?\s*g\b.*$/i, '')
    .replace(/,?\s*\d+\s*kom\b.*$/i, '')
    .trim()

  // Prefer segment after the last dash separator
  const dashParts = cleaned.split(/\s*[-–—]\s*/)
  if (dashParts.length >= 2) {
    const shade = dashParts[dashParts.length - 1].replace(/\s+/g, ' ').trim()
    // Codes: 100 | 3.N Neutral | 24 Golden Beige | 02 Soft Beige
    if (
      /^\d/.test(shade) ||
      /^(light|soft|dark|warm|cool|beige|ivory|nude|sand|rose|honey)/i.test(shade)
    ) {
      return shade
    }
  }

  const m = cleaned.match(
    /(?:nijansa|:)\s*([0-9]{1,3}(?:\.[A-Za-z0-9]+)?\s*[A-Za-zČĆŽŠĐčćžšđ].{0,40})$/u,
  )
  if (m) return m[1].replace(/\s+/g, ' ').trim()

  // Fallback: trailing shade code from product URL slug (…-puder-100)
  const fromUrl = String(url).match(/-(\d{2,3}(?:[.-][a-z0-9]+)?)(?:\/|$)/i)
  if (fromUrl) return fromUrl[1]

  return null
}

function srgbToLinear(c) {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function hexToLab(hex) {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const R = srgbToLinear(r)
  const G = srgbToLinear(g)
  const B = srgbToLinear(b)
  let x = R * 0.4124564 + G * 0.3575761 + B * 0.1804375
  let y = R * 0.2126729 + G * 0.7151522 + B * 0.072175
  let z = R * 0.0193339 + G * 0.119192 + B * 0.9503041
  x /= 0.95047
  y /= 1
  z /= 1.08883
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const fx = f(x)
  const fy = f(y)
  const fz = f(z)
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) }
}

function classifyFromHex(hex) {
  const lab = hexToLab(hex)
  const ita = (Math.atan((lab.L - 50) / (lab.b === 0 ? 0.0001 : lab.b)) * 180) / Math.PI
  let depth = 'medium'
  if (ita > 55) depth = 'very_light'
  else if (ita > 41) depth = 'light'
  else if (ita > 28) depth = 'medium'
  else if (ita > 10) depth = 'tan'
  else if (ita > -30) depth = 'deep'
  else depth = 'very_deep'

  const chroma = Math.hypot(lab.a, lab.b)
  const hue = (Math.atan2(lab.b, lab.a) * 180) / Math.PI
  let undertone = 'neutral'
  if (chroma >= 6) {
    if (lab.a < 8 && lab.b > 12 && hue > 70 && hue < 120) undertone = 'olive'
    else if (lab.b > lab.a + 2 && hue > 35 && hue < 100) undertone = 'warm'
    else if (lab.a >= lab.b - 1 && hue > -20 && hue < 55) undertone = 'cool'
  }

  const DEPTH_ORDER = ['very_light', 'light', 'medium', 'tan', 'deep', 'very_deep']
  const idx = DEPTH_ORDER.indexOf(depth)
  const depthMin = DEPTH_ORDER[Math.max(0, idx - 1)]
  const depthMax = DEPTH_ORDER[Math.min(DEPTH_ORDER.length - 1, idx + 1)]

  const paletteTags = []
  if (undertone === 'cool') paletteTags.push('rose', 'berry', 'mauve', 'taupe')
  else if (undertone === 'warm') paletteTags.push('peach', 'coral', 'bronze', 'gold', 'warm-nude')
  else if (undertone === 'olive') paletteTags.push('olive', 'caramel', 'muted-rose', 'bronze')
  else paletteTags.push('nude', 'soft-pink', 'champagne')

  return { undertone, depthMin, depthMax, paletteTags, lab, ita }
}

function pickHex(tileData) {
  const colors = tileData?.variants?.tileColors
  if (!Array.isArray(colors) || !colors.length) return null
  const selected = colors.find((c) => c.isSelected && c.hex) || colors.find((c) => c.hex)
  return selected?.hex ? String(selected.hex).toLowerCase() : null
}

function productFromHit(hit, hint) {
  const tile = hit.tileData || {}
  const title = hit.title || tile.title?.tileHeadlineLong || tile.title?.tileHeadline || ''
  const brand = hit.brandName || tile.brand?.name || 'DM'
  const hex = pickHex(tile)
  if (!hex) return null

  const dmCategories = tile.trackingData?.categories || []
  const category = inferCategory(title, dmCategories, hint)
  if (!category) return null

  const self = tile.self || ''
  const shadeName = parseShadeName(title, self)
  const meta = classifyFromHex(hex)
  const dan = String(hit.dan || tile.dan || '')
  const gtin = String(hit.gtin || tile.gtin || '')
  const imageUrl = tile.images?.[0]?.tileSrc || null
  const price = tile.trackingData?.price ?? null
  const selectedTooltip = tile.variants?.tileColors?.find((c) => c.isSelected)?.tooltip
  const colorFamily =
    selectedTooltip && selectedTooltip.toLowerCase() !== 'nude'
      ? String(selectedTooltip)
      : null

  const titleClean = title
    .replace(/,?\s*\d+(?:[.,]\d+)?\s*ml\b.*$/i, '')
    .replace(/,?\s*\d+(?:[.,]\d+)?\s*g\b.*$/i, '')
    .replace(/,?\s*\d+\s*kom\b.*$/i, '')
    .trim()
  const titleParts = titleClean.split(/\s*[-–—]\s*/)
  const lineName =
    titleParts.length >= 2 ? titleParts.slice(0, -1).join(' - ').trim() : titleClean

  return {
    id: `dm-${dan || gtin}`,
    name: shadeName ? `${lineName} — ${shadeName}` : title,
    brand,
    category,
    shadeHex: hex.startsWith('#') ? hex : `#${hex}`,
    shadeName: shadeName || colorFamily || title,
    undertone: meta.undertone,
    depthMin: meta.depthMin,
    depthMax: meta.depthMax,
    paletteTags: meta.paletteTags,
    url: self ? `https://www.dm.rs${self}` : undefined,
    imageUrl: imageUrl || undefined,
    priceRsd: typeof price === 'number' ? price : undefined,
    gtin: gtin || undefined,
    dan: dan || undefined,
    dmCategories,
    source: 'dm',
    lab: meta.lab,
    ita: Number(meta.ita.toFixed(2)),
  }
}

async function scrapeQuery({ query, categoryHint }) {
  const collected = []
  let page = 0
  let totalPages = 1

  while (page < totalPages) {
    const url = new URL(API)
    url.searchParams.set('query', query)
    url.searchParams.set('pageSize', String(PAGE_SIZE))
    url.searchParams.set('currentPage', String(page))
    url.searchParams.set('sort', 'relevance')

    console.log(`→ ${query} page ${page + 1}/${totalPages}`)
    const data = await fetchJson(url.toString())
    totalPages = Math.min(data.totalPages || 1, 40) // safety cap
    const products = data.products || []

    for (const hit of products) {
      const item = productFromHit(hit, categoryHint)
      if (item) collected.push(item)
    }

    page += 1
    if (page < totalPages) await sleep(DELAY_MS)
  }

  return collected
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  mkdirSync(PUBLIC_DIR, { recursive: true })
  const all = []
  const seen = new Set()

  for (const q of QUERIES) {
    try {
      const items = await scrapeQuery(q)
      for (const item of items) {
        if (seen.has(item.id)) continue
        seen.add(item.id)
        all.push(item)
      }
      console.log(`  kept unique total: ${all.length}`)
    } catch (err) {
      console.error(`Query failed (${q.query}):`, err.message)
    }
    await sleep(DELAY_MS)
  }

  // Strip heavy debug fields from products.json used by the app
  const forApp = all.map(({ lab, ita, dmCategories, ...rest }) => rest)

  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(join(OUT_DIR, 'dm-raw.json'), JSON.stringify(all, null, 2), 'utf8')
  writeFileSync(join(OUT_DIR, 'products.json'), JSON.stringify(forApp, null, 2), 'utf8')
  writeFileSync(join(PUBLIC_DIR, 'products.json'), JSON.stringify(forApp, null, 2), 'utf8')

  const byCat = forApp.reduce((acc, p) => {
    acc[p.category] = (acc[p.category] || 0) + 1
    return acc
  }, {})

  console.log('\nDone.')
  console.log('Products:', forApp.length)
  console.log('By category:', byCat)
  console.log('Wrote public/products.json, src/data/dm/products.json, src/data/dm/dm-raw.json')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
