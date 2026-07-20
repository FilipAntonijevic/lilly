/**
 * Re-parse shade names on an existing dm catalog without re-scraping.
 * Usage: node scripts/enrich-shades.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA = join(__dirname, '../src/data/products.json')
const RAW = join(__dirname, '../src/data/dm-raw.json')
const PUBLIC = join(__dirname, '../public/products.json')

function parseShadeName(title, url = '') {
  if (!title) return null
  const cleaned = title
    .replace(/,?\s*\d+(?:[.,]\d+)?\s*ml\b.*$/i, '')
    .replace(/,?\s*\d+(?:[.,]\d+)?\s*g\b.*$/i, '')
    .replace(/,?\s*\d+\s*kom\b.*$/i, '')
    .trim()

  const dashParts = cleaned.split(/\s*[-–—]\s*/)
  if (dashParts.length >= 2) {
    const shade = dashParts[dashParts.length - 1].replace(/\s+/g, ' ').trim()
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

  const fromUrl = String(url).match(/-(\d{2,3}(?:[.-][a-z0-9]+)?)(?:\/|$)/i)
  if (fromUrl) return fromUrl[1]

  return null
}

function lineName(title) {
  const cleaned = String(title)
    .replace(/,?\s*\d+(?:[.,]\d+)?\s*ml\b.*$/i, '')
    .replace(/,?\s*\d+(?:[.,]\d+)?\s*g\b.*$/i, '')
    .replace(/,?\s*\d+\s*kom\b.*$/i, '')
    .trim()
  const parts = cleaned.split(/\s*[-–—]\s*/)
  if (parts.length >= 2) return parts.slice(0, -1).join(' - ').trim()
  return cleaned
}

const products = JSON.parse(readFileSync(DATA, 'utf8'))
let improved = 0

for (const p of products) {
  // Longest string is most likely the original DM title
  const candidates = [p.shadeName, p.name].filter(Boolean)
  const title = candidates.sort((a, b) => b.length - a.length)[0]
  const shade = parseShadeName(title, p.url || '')
  if (!shade) continue

  const before = p.shadeName
  const line = lineName(title)
  p.shadeName = shade
  p.name = `${line} — ${shade}`
  if (before !== shade) improved++
}

writeFileSync(DATA, JSON.stringify(products, null, 2), 'utf8')
writeFileSync(PUBLIC, JSON.stringify(products, null, 2), 'utf8')

try {
  const raw = JSON.parse(readFileSync(RAW, 'utf8'))
  for (const p of raw) {
    const title = [p.shadeName, p.name].filter(Boolean).sort((a, b) => b.length - a.length)[0]
    const shade = parseShadeName(title, p.url || '')
    if (!shade) continue
    p.shadeName = shade
    p.name = `${lineName(title)} — ${shade}`
  }
  writeFileSync(RAW, JSON.stringify(raw, null, 2), 'utf8')
} catch {
  /* optional */
}

console.log(`Improved shade names: ${improved}/${products.length}`)
for (const p of products.slice(0, 10)) {
  console.log(`- ${p.brand}: ${p.shadeName} ${p.shadeHex}`)
}
