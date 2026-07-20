import { createServer } from 'node:http'
import { mkdir, writeFile, readdir, readFile, access } from 'node:fs/promises'
import { join } from 'node:path'

const PORT = Number(process.env.PORT || 8787)
const OUT_DIR = join(process.cwd(), 'uploads')

function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  res.end(payload)
}

function dataUrlToBuffer(dataUrl) {
  const m = /^data:(.+?);base64,(.+)$/.exec(dataUrl || '')
  if (!m) return null
  return Buffer.from(m[2], 'base64')
}

async function exists(p) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

await mkdir(OUT_DIR, { recursive: true })

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {})
    return
  }

  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, { ok: true })
    return
  }

  if (req.method === 'GET' && req.url === '/captures') {
    const ids = (await readdir(OUT_DIR, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()
    sendJson(res, 200, { ok: true, ids })
    return
  }

  if (req.method === 'POST' && req.url === '/calibration') {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    let body
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch {
      sendJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const dir = join(OUT_DIR, id)
    await mkdir(dir, { recursive: true })

    const mainBuf = dataUrlToBuffer(body.main)
    if (mainBuf) await writeFile(join(dir, 'main.jpg'), mainBuf)

    const frames = Array.isArray(body.frames) ? body.frames : []
    let saved = 0
    for (let i = 0; i < frames.length; i++) {
      const buf = dataUrlToBuffer(frames[i]?.dataUrl)
      if (!buf) continue
      const name = `frame-${String(i).padStart(2, '0')}-${frames[i].capturedAt || i}.jpg`
      await writeFile(join(dir, name), buf)
      saved++
    }

    await writeFile(
      join(dir, 'meta.json'),
      JSON.stringify(
        {
          id,
          capturedAt: body.capturedAt,
          userAgent: body.userAgent,
          frameCount: saved,
          // Optional client-side analysis snapshot for the labeling pipeline
          analysis: body.analysis ?? null,
        },
        null,
        2,
      ),
      'utf8',
    )

    // Seed a draft label for ml/prepare-captures
    await writeFile(
      join(dir, 'label.json'),
      JSON.stringify(
        {
          id,
          hair_family: body.analysis?.hair?.family ?? null,
          hair_temperature: body.analysis?.hair?.temperature ?? null,
          bald: body.analysis?.hair?.bald ?? null,
          fitzpatrick: body.analysis?.fitzpatrick ?? null,
          undertone: body.analysis?.undertone ?? null,
          skin_depth: body.analysis?.depth ?? null,
          notes: '',
          status: 'draft',
          createdAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      'utf8',
    )

    sendJson(res, 200, { ok: true, id, frames: saved })
    return
  }

  const labelMatch = req.url && /^\/captures\/([^/]+)\/label$/.exec(req.url)
  if (labelMatch && req.method === 'POST') {
    const id = decodeURIComponent(labelMatch[1])
    const dir = join(OUT_DIR, id)
    if (!(await exists(dir))) {
      sendJson(res, 404, { ok: false, error: 'not_found' })
      return
    }
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    let body
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch {
      sendJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }
    const path = join(dir, 'label.json')
    const prev = (await exists(path))
      ? JSON.parse(await readFile(path, 'utf8'))
      : { id }
    const next = { ...prev, ...body, id, updatedAt: new Date().toISOString() }
    if (next.hair_family === 'bald') next.bald = true
    await writeFile(path, JSON.stringify(next, null, 2), 'utf8')
    sendJson(res, 200, { ok: true, label: next })
    return
  }

  sendJson(res, 404, { ok: false, error: 'not_found' })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`calibration server on http://127.0.0.1:${PORT}/calibration`)
})
