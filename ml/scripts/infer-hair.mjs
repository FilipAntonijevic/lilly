/**
 * Batch-run enzostvs/hair-color on prepared captures (writes draft_prediction.json).
 *
 *   node scripts/infer-hair.mjs [--captures ./data/captures]
 */
import { readdir, readFile, writeFile, access } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipeline } from '@huggingface/transformers'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const root = resolve(__dirname, '..')

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

async function exists(p) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

const capturesDir = resolve(root, arg('--captures', './data/captures'))

function mapLabel(label) {
  const key = String(label).toLowerCase()
  if (key.includes('bald')) return { family: 'bald', bald: true }
  if (key.includes('black')) return { family: 'black', bald: false }
  if (key.includes('blond')) return { family: 'blonde', bald: false }
  if (key.includes('red')) return { family: 'red', bald: false }
  if (key.includes('white')) return { family: 'gray', bald: false }
  return { family: 'unknown', bald: false }
}

async function main() {
  console.log('Loading hair-color model (first run downloads ~340MB)…')
  const classifier = await pipeline('image-classification', 'enzostvs/hair-color')

  const ids = (await readdir(capturesDir, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)

  for (const id of ids) {
    const image = join(capturesDir, id, 'main.jpg')
    if (!(await exists(image))) continue
    const raw = await classifier(image, { topk: 5 })
    const top = raw[0]
    const mapped = mapLabel(top.label)
    const draft = {
      id,
      model: 'enzostvs/hair-color',
      hair: {
        ...mapped,
        rawLabel: top.label,
        confidence: top.score,
        scores: Object.fromEntries(raw.map((r) => [r.label, r.score])),
      },
      fitzpatrick: null,
      inferredAt: new Date().toISOString(),
    }
    await writeFile(
      join(capturesDir, id, 'draft_prediction.json'),
      JSON.stringify(draft, null, 2),
      'utf8',
    )

    // Seed label.json if still draft/empty
    const labelPath = join(capturesDir, id, 'label.json')
    if (await exists(labelPath)) {
      const label = JSON.parse(await readFile(labelPath, 'utf8'))
      if (label.status === 'draft' && !label.hair_family) {
        label.hair_family = mapped.family
        label.bald = mapped.bald
        label.notes = (label.notes || '') + ' [auto from hair ML]'
        await writeFile(labelPath, JSON.stringify(label, null, 2), 'utf8')
      }
    }
    console.log(id, mapped.family, top.score.toFixed(3))
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
