// Panel en vivo — servidor
// El público sube archivos desde /  ·  el presentador gestiona en /panel  ·  el proyector muestra /pantalla
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const multer = require('multer');
const QRCode = require('qrcode');
const { Server } = require('socket.io');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const PUBLIC_URL = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');
const MAX_FILE_MB = Number(process.env.MAX_FILE_MB) || 50;
const ADMIN_PIN = String(process.env.ADMIN_PIN || crypto.randomInt(1000, 10000));

const BOARD_W = 1920;
const BOARD_H = 1080;

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ---------- Tipos de archivo permitidos ----------
const ALLOWED = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif',
  'image/avif': '.avif', 'image/heic': '.heic', 'image/heif': '.heif', 'image/svg+xml': '.svg',
  'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov',
  'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a', 'audio/wav': '.wav',
  'audio/x-wav': '.wav', 'audio/ogg': '.ogg', 'audio/webm': '.weba', 'audio/aac': '.aac',
  'application/pdf': '.pdf', 'text/plain': '.txt',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/msword': '.doc', 'application/vnd.ms-powerpoint': '.ppt', 'application/vnd.ms-excel': '.xls',
  'application/zip': '.zip',
};
// Tipos que el navegador puede mostrar en línea con seguridad
const INLINE_OK = /^(image\/(jpeg|png|webp|gif|avif)|video\/|audio\/|application\/pdf)/;

// ---------- Estado ----------
const defaultState = () => ({
  settings: {
    title: 'Comparte tus fotos y archivos',
    subtitle: 'Escanea el QR y súbelos desde tu móvil',
    moderation: false,
    uploadsOpen: true,
    showQr: true,
    bigQr: true, // QR a pantalla completa mientras no haya archivos
    background: '#14161b',
    spotlight: '',
    camera: { mode: 'auto' }, // auto: se ve todo el muro · manual: lo que elige el presentador
    qrFull: false,            // QR a pantalla completa ahora mismo
  },
  elements: [],
});

let state;
try {
  state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  state.settings = { ...defaultState().settings, ...(state.settings || {}) };
  state.elements = Array.isArray(state.elements) ? state.elements : [];
} catch {
  state = defaultState();
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = STATE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, STATE_FILE);
  }, 400);
}

const newId = () => crypto.randomBytes(6).toString('hex');
const maxZ = () => state.elements.reduce((m, e) => Math.max(m, e.z || 0), 0);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const str = (v, max) => String(v ?? '').slice(0, max);

// Los textos anclados a una foto guardan su posición relativa a ella.
// Si la foto cambia de tamaño, sus textos se escalan con ella.
function scaleChildren(parentId, k) {
  if (!Number.isFinite(k) || k <= 0 || Math.abs(k - 1) < 1e-6) return;
  for (const c of state.elements) {
    if (c.parent !== parentId) continue;
    c.x = Math.round(c.x * k * 10) / 10; c.y = Math.round(c.y * k * 10) / 10;
    c.w = clamp(Math.round(c.w * k), 30, 4000);
    if (c.style) c.style.size = clamp(Math.round((c.style.size || 48) * k * 10) / 10, 6, 400);
  }
}

function publicState() {
  return {
    settings: state.settings,
    elements: state.elements.filter((e) => e.status === 'live' && !e.hidden),
  };
}

// ---------- App ----------
const app = express();
app.set('trust proxy', true);
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e6 });

function broadcast() {
  io.to('admin').emit('state', state);
  io.to('viewer').emit('state', publicState());
  save();
}

app.use(express.json({ limit: '200kb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], index: false }));

// Los archivos subidos se sirven aislados: nunca pueden ejecutar código en esta web.
app.use('/files', express.static(UPLOAD_DIR, {
  maxAge: '1h',
  setHeaders(res, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mime = Object.keys(ALLOWED).find((m) => ALLOWED[m] === ext) || '';
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // El visor de PDF del navegador no funciona en modo sandbox; el resto sí se aísla.
    if (mime !== 'application/pdf') {
      res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");
    }
    if (!INLINE_OK.test(mime)) res.setHeader('Content-Disposition', 'attachment');
  },
}));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'upload.html')));
app.get('/panel', (req, res) => res.sendFile(path.join(__dirname, 'public', 'panel.html')));
app.get('/pantalla', (req, res) => res.sendFile(path.join(__dirname, 'public', 'panel.html')));

function lanIp() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) return i.address;
  }
  return null;
}

function uploadUrl(req) {
  if (PUBLIC_URL) return PUBLIC_URL + '/';
  const host = req.get('host') || `localhost:${PORT}`;
  if (/^(localhost|127\.|\[::1\])/.test(host)) {
    const ip = lanIp();
    if (ip) return `http://${ip}:${PORT}/`;
  }
  return `${req.protocol}://${host}/`;
}

app.get('/api/info', async (req, res) => {
  const url = uploadUrl(req);
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 600, errorCorrectionLevel: 'M' });
  res.json({ uploadUrl: url, qr, title: state.settings.title, subtitle: state.settings.subtitle,
    uploadsOpen: state.settings.uploadsOpen, maxFileMb: MAX_FILE_MB, board: { w: BOARD_W, h: BOARD_H } });
});

// ---------- Subidas del público ----------
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => cb(null, newId() + (ALLOWED[file.mimetype] || '')),
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: 10, fields: 20 },
  fileFilter: (req, file, cb) => cb(null, Boolean(ALLOWED[file.mimetype])),
});

// Limitador sencillo: 40 archivos por IP cada 10 minutos
const hits = new Map();
function rateOk(ip, n) {
  const now = Date.now();
  const rec = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  if (rec.length + n > 40) return false;
  for (let i = 0; i < n; i++) rec.push(now);
  hits.set(ip, rec);
  return true;
}

function kindOf(mime) {
  if (/^image\/(jpeg|png|webp|gif|avif|svg\+xml)$/.test(mime)) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'pdf';
  return 'doc';
}

// Busca un hueco libre para una foto nueva: primero en la pantalla de referencia y,
// si ya está llena, en un muro cada vez más grande alrededor (la cámara automática lo mostrará entero).
function placeFor(w, h) {
  const roots = state.elements.filter((e) => e.status === 'live' && !e.hidden && !e.parent && e.kind !== 'text');
  const M = 18; // separación mínima
  const free = (x, y) => {
    if (x < BOARD_W - 340 && x + w > BOARD_W - 360 && y + h > BOARD_H - 380 && y < BOARD_H) return false; // esquina del QR
    for (const o of roots) {
      if (x < o.x + o.w + M && x + w + M > o.x && y < o.y + o.h + M && y + h + M > o.y) return false;
    }
    return true;
  };
  const cx = BOARD_W / 2, cy = BOARD_H / 2 + 40;
  for (const f of [1, 1.35, 1.8, 2.4, 3.2, 4.2, 5.5, 7]) {
    const W = BOARD_W * f, H = BOARD_H * f, x0 = cx - W / 2, y0 = (f === 1 ? 100 : cy - H / 2), y1 = cy + H / 2;
    const cands = [];
    const step = 30 * f;
    for (let x = x0 + 30; x + w <= x0 + W - 30; x += step) {
      for (let y = y0; y + h <= y1 - 30; y += step) cands.push([x, y, Math.hypot(x + w / 2 - cx, (y + h / 2 - cy) * 1.6)]);
    }
    cands.sort((a, b) => a[2] - b[2]);
    // Un poco de azar entre los mejores huecos para que no quede todo en fila
    const ok = [];
    for (const c of cands) { if (free(c[0], c[1])) { ok.push(c); if (ok.length >= 6) break; } }
    if (ok.length) { const c = ok[Math.floor(Math.random() * ok.length)]; return { x: c[0], y: c[1] }; }
  }
  return { x: 60 + Math.random() * 400, y: 100 + Math.random() * 300 };
}

app.post('/api/upload', (req, res) => {
  if (!state.settings.uploadsOpen) return res.status(403).json({ error: 'Las subidas están cerradas ahora mismo.' });
  upload.array('files', 10)(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? `Algún archivo supera ${MAX_FILE_MB} MB.` : 'No se pudo subir.';
      return res.status(400).json({ error: msg });
    }
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: 'No llegó ningún archivo compatible.' });
    if (!rateOk(req.ip, files.length)) {
      files.forEach((f) => fs.unlink(f.path, () => {}));
      return res.status(429).json({ error: 'Has subido muchos archivos seguidos. Espera unos minutos.' });
    }
    let dims = [];
    try { dims = JSON.parse(req.body.dims || '[]'); } catch {}
    const author = str(req.body.author, 60).trim();
    const message = str(req.body.message, 280).trim();

    files.forEach((f, i) => {
      const kind = kindOf(f.mimetype);
      let w = 340, h = 240;
      const d = dims[i];
      if ((kind === 'image' || kind === 'video') && d && d.w > 0 && d.h > 0) {
        const ratio = d.w / d.h;
        if (ratio >= 1) { w = 380; h = Math.round(380 / ratio); } else { h = 380; w = Math.round(380 * ratio); }
      } else if (kind === 'audio') { w = 340; h = 150; }
      else if (kind === 'pdf' || kind === 'doc') { w = 260; h = 200; }
      const { x, y } = placeFor(w, h);
      state.elements.push({
        id: newId(), kind, createdAt: Date.now(),
        status: state.settings.moderation ? 'pending' : 'live', hidden: false,
        x: Math.round(x), y: Math.round(y), w, h, rot: Math.round((Math.random() - 0.5) * 8), z: maxZ() + 1,
        file: { url: '/files/' + f.filename, originalUrl: '/files/' + f.filename, name: str(f.originalname, 120), mime: f.mimetype, size: f.size },
        author, message, showCaption: Boolean(author || message),
      });
    });
    broadcast();
    res.json({ ok: true, count: files.length, moderated: state.settings.moderation });
  });
});

// ---------- Acciones del presentador ----------
const isAdmin = (pin) => typeof pin === 'string' && crypto.timingSafeEqual(
  crypto.createHash('sha256').update(pin).digest(), crypto.createHash('sha256').update(ADMIN_PIN).digest());

const editUpload = multer({
  storage, limits: { fileSize: 40 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(jpeg|png|webp)$/.test(file.mimetype)),
});
app.post('/api/edit/:id', (req, res) => {
  if (!isAdmin(req.get('x-admin-pin'))) return res.status(401).json({ error: 'PIN incorrecto' });
  editUpload.single('image')(req, res, (err) => {
    const el = state.elements.find((e) => e.id === req.params.id);
    if (err || !req.file || !el || el.kind !== 'image') {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'No se pudo guardar la edición.' });
    }
    const prev = el.file.url;
    el.file.url = '/files/' + req.file.filename;
    el.file.mime = req.file.mimetype;
    // Ajusta la proporción manteniendo la anchura actual
    const w = num(req.body.w, 0), h = num(req.body.h, 0);
    if (w > 0 && h > 0) el.h = Math.round(el.w * (h / w));
    if (prev !== el.file.originalUrl) fs.unlink(path.join(UPLOAD_DIR, path.basename(prev)), () => {});
    broadcast();
    res.json({ ok: true });
  });
});

io.on('connection', (socket) => {
  const { pin, role } = socket.handshake.auth || {};
  if (role === 'admin') {
    if (!isAdmin(pin)) { socket.emit('auth-error'); return socket.disconnect(true); }
    socket.join('admin');
    socket.emit('state', state);
  } else {
    socket.join('viewer');
    socket.emit('state', publicState());
    return;
  }

  const find = (id) => state.elements.find((e) => e.id === id);

  socket.on('update', ({ id, patch } = {}) => {
    const el = find(id);
    if (!el || !patch || typeof patch !== 'object') return;
    const oldW = el.w;
    if (el.kind === 'text' && 'parent' in patch) {
      const p = patch.parent && find(patch.parent);
      el.parent = p && p.kind !== 'text' ? p.id : null;
    }
    if ('x' in patch) el.x = clamp(num(patch.x, el.x), -2000, BOARD_W + 2000);
    if ('y' in patch) el.y = clamp(num(patch.y, el.y), -2000, BOARD_H + 2000);
    if ('w' in patch) el.w = clamp(num(patch.w, el.w), 30, 4000);
    if ('h' in patch) el.h = clamp(num(patch.h, el.h), 20, 4000);
    if ('rot' in patch) el.rot = clamp(num(patch.rot, el.rot), -360, 360);
    if ('hidden' in patch) el.hidden = Boolean(patch.hidden);
    if ('status' in patch && ['live', 'pending'].includes(patch.status)) el.status = patch.status;
    if ('showCaption' in patch) el.showCaption = Boolean(patch.showCaption);
    if ('message' in patch) el.message = str(patch.message, 280);
    if (el.kind !== 'text' && el.w !== oldW) scaleChildren(el.id, el.w / oldW);
    if ('playing' in patch) el.playing = Boolean(patch.playing);
    if ('muted' in patch) el.muted = Boolean(patch.muted);
    if (el.kind === 'text') {
      if ('text' in patch) el.text = str(patch.text, 2000);
      if (patch.style && typeof patch.style === 'object') {
        const s = patch.style; el.style = el.style || {};
        if ('color' in s) el.style.color = str(s.color, 30);
        if ('bg' in s) el.style.bg = str(s.bg, 30);
        if ('size' in s) el.style.size = clamp(num(s.size, 48), 10, 400);
        if ('bold' in s) el.style.bold = Boolean(s.bold);
        if ('align' in s && ['left', 'center', 'right'].includes(s.align)) el.style.align = s.align;
        if ('font' in s && ['sans', 'serif', 'mono', 'hand'].includes(s.font)) el.style.font = s.font;
      }
    }
    broadcast();
  });

  // Cámara (zoom y desplazamiento): mensaje ligero, no reenvía todo el estado
  socket.on('camera', (c) => {
    if (!c || typeof c !== 'object') return;
    const cam = c.mode === 'manual'
      ? { mode: 'manual', x: clamp(num(c.x, BOARD_W / 2), -50000, 50000), y: clamp(num(c.y, BOARD_H / 2), -50000, 50000), z: clamp(num(c.z, 1), 0.03, 12) }
      : { mode: 'auto' };
    state.settings.camera = cam;
    socket.broadcast.emit('camera', cam);
    save();
  });

  socket.on('front', (id) => { const el = find(id); if (el) { el.z = maxZ() + 1; broadcast(); } });
  socket.on('back', (id) => {
    const el = find(id); if (!el) return;
    const min = state.elements.reduce((m, e) => Math.min(m, e.z || 0), 0);
    el.z = min - 1; broadcast();
  });

  socket.on('add-text', (opts, ack) => {
    opts = opts && typeof opts === 'object' ? opts : {};
    const id = newId();
    const p = opts.parent && find(opts.parent);
    const base = { id, kind: 'text', createdAt: Date.now(), status: 'live', hidden: false, h: 140, rot: 0,
      text: str(opts.text || 'Escribe aquí', 2000) };
    if (p && p.kind !== 'text') {
      // Texto anclado: coordenadas relativas a la foto
      const w = Math.round(Math.min(600, p.w * 0.9));
      const size = Math.round(clamp(p.w / 9, 16, 64));
      state.elements.push({ ...base, parent: p.id, w, x: Math.round((p.w - w) / 2), y: Math.round(p.h * 0.62), z: 1,
        style: { color: '#ffffff', bg: 'rgba(0,0,0,0.55)', size, bold: true, align: 'center', font: 'sans' } });
    } else {
      state.elements.push({ ...base, parent: null, w: 600, z: maxZ() + 1,
        x: clamp(num(opts.x, 660), -2000, BOARD_W + 2000), y: clamp(num(opts.y, 470), -2000, BOARD_H + 2000),
        style: { color: '#ffffff', bg: 'rgba(0,0,0,0.55)', size: 64, bold: true, align: 'center', font: 'sans' } });
    }
    broadcast();
    if (typeof ack === 'function') ack(id);
  });

  socket.on('delete', (id) => {
    const i = state.elements.findIndex((e) => e.id === id);
    if (i < 0) return;
    const [el] = state.elements.splice(i, 1);
    state.elements = state.elements.filter((c) => c.parent !== el.id); // sus textos se van con ella
    if (el.file) for (const u of new Set([el.file.url, el.file.originalUrl])) fs.unlink(path.join(UPLOAD_DIR, path.basename(u)), () => {});
    broadcast();
  });

  socket.on('restore-original', (id) => {
    const el = find(id);
    if (!el || !el.file || el.file.url === el.file.originalUrl) return;
    fs.unlink(path.join(UPLOAD_DIR, path.basename(el.file.url)), () => {});
    el.file.url = el.file.originalUrl;
    broadcast();
  });

  socket.on('layout', (positions) => {
    if (!Array.isArray(positions)) return;
    for (const p of positions.slice(0, 2000)) {
      const el = find(p && p.id); if (!el) continue;
      const oldW = el.w;
      el.x = num(p.x, el.x); el.y = num(p.y, el.y); el.w = clamp(num(p.w, el.w), 30, 4000);
      el.h = clamp(num(p.h, el.h), 20, 4000); el.rot = clamp(num(p.rot, 0), -360, 360);
      if (el.kind !== 'text') scaleChildren(el.id, el.w / oldW);
    }
    broadcast();
  });

  socket.on('settings', (patch = {}) => {
    const s = state.settings;
    if ('title' in patch) s.title = str(patch.title, 120);
    if ('subtitle' in patch) s.subtitle = str(patch.subtitle, 200);
    if ('moderation' in patch) s.moderation = Boolean(patch.moderation);
    if ('uploadsOpen' in patch) s.uploadsOpen = Boolean(patch.uploadsOpen);
    if ('showQr' in patch) s.showQr = Boolean(patch.showQr);
    if ('bigQr' in patch) s.bigQr = Boolean(patch.bigQr);
    if ('background' in patch) s.background = str(patch.background, 30);
    if ('spotlight' in patch) s.spotlight = str(patch.spotlight, 40);
    if ('qrFull' in patch) s.qrFull = Boolean(patch.qrFull);
    broadcast();
  });

  socket.on('clear-all', () => {
    for (const el of state.elements) {
      if (el.file) for (const u of new Set([el.file.url, el.file.originalUrl])) fs.unlink(path.join(UPLOAD_DIR, path.basename(u)), () => {});
    }
    state.elements = [];
    broadcast();
  });
});

server.listen(PORT, () => {
  const ip = lanIp();
  const base = PUBLIC_URL || (ip ? `http://${ip}:${PORT}` : `http://localhost:${PORT}`);
  console.log('\n  Panel en vivo funcionando\n');
  console.log(`  Público (QR):   ${base}/`);
  console.log(`  Tu panel:       ${base}/panel`);
  console.log(`  Proyector:      ${base}/pantalla`);
  console.log(`\n  PIN del panel:  ${ADMIN_PIN}${process.env.ADMIN_PIN ? '' : '   (fíjalo con ADMIN_PIN=...)'}\n`);
});
