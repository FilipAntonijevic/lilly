/**
 * Tiny local labeling UI for capture bundles.
 *
 *   node scripts/label-server.mjs [--captures ./data/captures] [--port 8790]
 */
import { createServer } from 'node:http'
import { readFile, writeFile, readdir, access } from 'node:fs/promises'
import { join, resolve, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const root = resolve(__dirname, '..')

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const capturesDir = resolve(root, arg('--captures', './data/captures'))
const PORT = Number(arg('--port', '8790'))

async function exists(p) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

const HTML = `<!doctype html>
<html lang="sr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Lilly labeler</title>
  <style>
    :root { font-family: "Segoe UI", system-ui, sans-serif; color: #1c1410; background: #f3ebe3; }
    body { margin: 0; padding: 1.25rem; }
    h1 { font-size: 1.35rem; margin: 0 0 1rem; }
    .row { display: grid; grid-template-columns: 280px 1fr; gap: 1.25rem; }
    img { width: 280px; height: 280px; object-fit: cover; border-radius: 8px; background: #ddd; }
    label { display: block; margin: 0.45rem 0 0.15rem; font-size: 0.85rem; }
    select, input, textarea, button { font: inherit; padding: 0.4rem 0.55rem; width: 100%; max-width: 360px; }
    button { width: auto; cursor: pointer; background: #1c1410; color: #f7efe6; border: 0; border-radius: 6px; margin-right: 0.4rem; }
    .nav { margin-bottom: 1rem; display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
    .muted { opacity: 0.65; font-size: 0.85rem; }
  </style>
</head>
<body>
  <h1>Lilly — label captures</h1>
  <div class="nav">
    <button id="prev" type="button">← Prev</button>
    <button id="next" type="button">Next →</button>
    <span id="pos" class="muted"></span>
  </div>
  <div class="row">
    <img id="photo" alt="capture" />
    <form id="form">
      <label>hair_family</label>
      <select name="hair_family">
        <option value="">—</option>
        <option>blonde</option><option>light_brown</option><option>brown</option>
        <option>black</option><option>red</option><option>gray</option>
        <option>bald</option><option>unknown</option>
      </select>
      <label>bald</label>
      <select name="bald"><option value="">—</option><option value="true">true</option><option value="false">false</option></select>
      <label>hair_temperature</label>
      <select name="hair_temperature"><option value="">—</option><option>cool</option><option>warm</option><option>neutral</option></select>
      <label>fitzpatrick (I–VI)</label>
      <select name="fitzpatrick"><option value="">—</option><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option><option>6</option></select>
      <label>undertone</label>
      <select name="undertone"><option value="">—</option><option>cool</option><option>warm</option><option>neutral</option><option>olive</option></select>
      <label>skin_depth</label>
      <select name="skin_depth"><option value="">—</option>
        <option>very_light</option><option>light</option><option>medium</option>
        <option>tan</option><option>deep</option><option>very_deep</option>
      </select>
      <label>notes</label>
      <textarea name="notes" rows="3"></textarea>
      <label>status</label>
      <select name="status"><option>draft</option><option>labeled</option><option>approved</option></select>
      <p style="margin-top:1rem">
        <button type="submit">Save</button>
      </p>
      <p id="msg" class="muted"></p>
      <pre id="draft" class="muted"></pre>
    </form>
  </div>
  <script>
    let ids = [];
    let i = 0;
    const $ = (id) => document.getElementById(id);
    async function loadIndex() {
      const res = await fetch('/api/ids');
      ids = await res.json();
      i = 0;
      await show();
    }
    async function show() {
      if (!ids.length) { $('pos').textContent = 'No captures — run prepare:captures'; return; }
      const id = ids[i];
      $('pos').textContent = (i+1) + ' / ' + ids.length + ' · ' + id;
      $('photo').src = '/image/' + encodeURIComponent(id) + '/main.jpg?' + Date.now();
      const label = await (await fetch('/api/label/' + encodeURIComponent(id))).json();
      const form = $('form');
      for (const [k,v] of Object.entries(label)) {
        if (form.elements[k] != null) form.elements[k].value = v == null ? '' : String(v);
      }
      const draft = await (await fetch('/api/draft/' + encodeURIComponent(id))).json();
      $('draft').textContent = JSON.stringify(draft, null, 2);
      $('msg').textContent = '';
    }
    $('prev').onclick = async () => { i = (i - 1 + ids.length) % ids.length; await show(); };
    $('next').onclick = async () => { i = (i + 1) % ids.length; await show(); };
    $('form').onsubmit = async (e) => {
      e.preventDefault();
      const id = ids[i];
      const fd = new FormData(e.target);
      const body = Object.fromEntries(fd.entries());
      if (body.bald === 'true') body.bald = true;
      else if (body.bald === 'false') body.bald = false;
      else body.bald = null;
      if (body.fitzpatrick) body.fitzpatrick = Number(body.fitzpatrick);
      else body.fitzpatrick = null;
      for (const k of ['hair_family','hair_temperature','undertone','skin_depth']) {
        if (body[k] === '') body[k] = null;
      }
      const res = await fetch('/api/label/' + encodeURIComponent(id), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      $('msg').textContent = res.ok ? 'Saved.' : 'Save failed';
    };
    loadIndex();
  </script>
</body>
</html>`

function send(res, status, body, type = 'application/json') {
  const payload = typeof body === 'string' ? body : JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': type,
    'Access-Control-Allow-Origin': '*',
  })
  res.end(payload)
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`)

  if (req.method === 'GET' && url.pathname === '/') {
    send(res, 200, HTML, 'text/html; charset=utf-8')
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/ids') {
    if (!(await exists(capturesDir))) {
      send(res, 200, [])
      return
    }
    const ids = (await readdir(capturesDir, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()
    send(res, 200, ids)
    return
  }

  const labelMatch = url.pathname.match(/^\/api\/label\/([^/]+)$/)
  if (labelMatch) {
    const id = decodeURIComponent(labelMatch[1])
    const path = join(capturesDir, id, 'label.json')
    if (req.method === 'GET') {
      if (!(await exists(path))) {
        send(res, 404, { error: 'missing' })
        return
      }
      send(res, 200, JSON.parse(await readFile(path, 'utf8')))
      return
    }
    if (req.method === 'POST') {
      const chunks = []
      for await (const c of req) chunks.push(c)
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      const prev = (await exists(path))
        ? JSON.parse(await readFile(path, 'utf8'))
        : { id }
      const next = {
        ...prev,
        ...body,
        id,
        updatedAt: new Date().toISOString(),
      }
      if (next.hair_family === 'bald') next.bald = true
      await writeFile(path, JSON.stringify(next, null, 2), 'utf8')
      send(res, 200, { ok: true, label: next })
      return
    }
  }

  const draftMatch = url.pathname.match(/^\/api\/draft\/([^/]+)$/)
  if (req.method === 'GET' && draftMatch) {
    const id = decodeURIComponent(draftMatch[1])
    const path = join(capturesDir, id, 'draft_prediction.json')
    if (!(await exists(path))) {
      send(res, 200, {})
      return
    }
    send(res, 200, JSON.parse(await readFile(path, 'utf8')))
    return
  }

  const imgMatch = url.pathname.match(/^\/image\/([^/]+)\/([^/]+)$/)
  if (req.method === 'GET' && imgMatch) {
    const id = decodeURIComponent(imgMatch[1])
    const file = imgMatch[2]
    if (!file.endsWith('.jpg') && !file.endsWith('.jpeg')) {
      send(res, 400, { error: 'bad_file' })
      return
    }
    const path = join(capturesDir, id, file)
    if (!(await exists(path))) {
      send(res, 404, { error: 'missing' })
      return
    }
    const buf = await readFile(path)
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' })
    res.end(buf)
    return
  }

  send(res, 404, { error: 'not_found' })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`label UI http://127.0.0.1:${PORT}`)
  console.log(`captures: ${capturesDir}`)
})
