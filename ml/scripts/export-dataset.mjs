/**
 * Export labeled captures to JSONL for training.
 *
 *   node scripts/export-dataset.mjs [--captures ./data/captures] [--out ./data/datasets]
 */
import { mkdir, readdir, readFile, writeFile, access } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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
const outDir = resolve(root, arg('--out', './data/datasets'))

async function main() {
  await mkdir(outDir, { recursive: true })
  const ids = (await readdir(capturesDir, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)

  const hairRows = []
  const fitzRows = []

  for (const id of ids) {
    const dir = join(capturesDir, id)
    const labelPath = join(dir, 'label.json')
    if (!(await exists(labelPath))) continue
    const label = JSON.parse(await readFile(labelPath, 'utf8'))
    if (label.status !== 'approved' && label.status !== 'labeled') continue

    const image = join(dir, 'main.jpg').replace(/\\/g, '/')
    if (label.hair_family) {
      hairRows.push({
        id,
        image,
        hair_family: label.hair_family,
        bald: label.bald === true || label.hair_family === 'bald',
        hair_temperature: label.hair_temperature ?? null,
      })
    }
    if (label.fitzpatrick) {
      fitzRows.push({
        id,
        image,
        fitzpatrick: Number(label.fitzpatrick),
        undertone: label.undertone ?? null,
        skin_depth: label.skin_depth ?? null,
      })
    }
  }

  const stamp = new Date().toISOString().slice(0, 10)
  const hairPath = join(outDir, `hair-${stamp}.jsonl`)
  const fitzPath = join(outDir, `fitzpatrick-${stamp}.jsonl`)
  await writeFile(hairPath, hairRows.map((r) => JSON.stringify(r)).join('\n') + (hairRows.length ? '\n' : ''))
  await writeFile(fitzPath, fitzRows.map((r) => JSON.stringify(r)).join('\n') + (fitzRows.length ? '\n' : ''))

  console.log(`Hair labels: ${hairRows.length} → ${hairPath}`)
  console.log(`Fitzpatrick labels: ${fitzRows.length} → ${fitzPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
