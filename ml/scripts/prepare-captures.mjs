/**
 * Ingest calibration uploads → labeling workspace.
 *
 * Usage:
 *   node scripts/prepare-captures.mjs [--uploads ../server/uploads] [--out ./data/captures]
 */
import { mkdir, readdir, readFile, writeFile, copyFile, access } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const root = resolve(__dirname, '..')

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const uploadsDir = resolve(root, arg('--uploads', '../server/uploads'))
const outDir = resolve(root, arg('--out', './data/captures'))

async function exists(p) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

const emptyLabel = {
  hair_family: null,
  hair_temperature: null,
  bald: null,
  fitzpatrick: null,
  undertone: null,
  skin_depth: null,
  notes: '',
  status: 'draft',
}

async function main() {
  if (!(await exists(uploadsDir))) {
    console.error(`Uploads dir missing: ${uploadsDir}`)
    console.error('Start server, capture a few selfies, then re-run.')
    process.exit(1)
  }

  await mkdir(outDir, { recursive: true })
  const ids = (await readdir(uploadsDir, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)

  let prepared = 0
  for (const id of ids) {
    const src = join(uploadsDir, id)
    const dest = join(outDir, id)
    await mkdir(dest, { recursive: true })

    const mainSrc = join(src, 'main.jpg')
    if (await exists(mainSrc)) {
      await copyFile(mainSrc, join(dest, 'main.jpg'))
    }

    const files = await readdir(src)
    for (const f of files) {
      if (f.startsWith('frame-') && f.endsWith('.jpg')) {
        await copyFile(join(src, f), join(dest, f))
      }
    }

    if (await exists(join(src, 'meta.json'))) {
      await copyFile(join(src, 'meta.json'), join(dest, 'meta.json'))
    }

    const labelPath = join(dest, 'label.json')
    if (!(await exists(labelPath))) {
      await writeFile(
        labelPath,
        JSON.stringify({ id, ...emptyLabel, createdAt: new Date().toISOString() }, null, 2),
        'utf8',
      )
    }

    // Preserve auto draft if present
    const draftPath = join(dest, 'draft_prediction.json')
    if (!(await exists(draftPath))) {
      await writeFile(
        draftPath,
        JSON.stringify({ id, hair: null, fitzpatrick: null }, null, 2),
        'utf8',
      )
    }

    prepared++
  }

  const index = {
    preparedAt: new Date().toISOString(),
    count: prepared,
    ids,
  }
  await writeFile(join(outDir, 'index.json'), JSON.stringify(index, null, 2), 'utf8')
  console.log(`Prepared ${prepared} capture bundles → ${outDir}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
