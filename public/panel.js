// Panel en vivo — panel del presentador (/panel) y vista de proyector (/pantalla)
(() => {
  const MODE = location.pathname.startsWith('/pantalla') ? 'view' : 'admin';
  document.body.classList.add('mode-' + MODE);
  const BW = 1920, BH = 1080;
  const $ = (s, r = document) => r.querySelector(s);
  const board = $('#board'), wrap = $('#stageWrap'), space = $('#space');
  // El área de referencia (1920×1080) siempre se ve entera; el tablero se estira para llenar el resto de la pantalla.
  const view = { w: BW, h: BH, ox: 0, oy: 0 };

  let state = { settings: {}, elements: [] };
  let socket = null, pin = null, scale = 1, initialized = false;
  let selectedId = null, editingId = null, action = null, recent = null;
  let lastCamLocal = 0; // cuándo movió el presentador la cámara por última vez
  const nodes = new Map();
  const known = new Set();

  // ---------- Iconos ----------
  const P = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICON = {
    text: P('<path d="M5 6V4h14v2M12 4v16M9 20h6"/>'),
    grid: P('<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>'),
    collage: P('<rect x="3" y="5" width="9" height="8" rx="1" transform="rotate(-8 7 9)"/><rect x="12" y="10" width="9" height="8" rx="1" transform="rotate(7 16 14)"/>'),
    qr: P('<rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2"/>'),
    upload: P('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>'),
    shield: P('<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>'),
    screen: P('<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>'),
    expand: P('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
    trash: P('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
    side: P('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>'),
    close: P('<path d="M6 6l12 12M18 6L6 18"/>'),
    edit: P('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>'),
    eye: P('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    eyeoff: P('<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4.4-1"/>'),
    front: P('<rect x="8" y="8" width="12" height="12" rx="1.5" fill="currentColor" fill-opacity=".25"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/>'),
    back: P('<rect x="4" y="4" width="12" height="12" rx="1.5"/><path d="M20 8v11a1 1 0 0 1-1 1H8"/>'),
    view: P('<path d="M15 3h6v6M21 3l-7 7M9 21H3v-6M3 21l7-7"/>'),
    caption: P('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 15h10"/>'),
    play: P('<path d="M7 5v14l11-7z" fill="currentColor"/>'),
    pause: P('<path d="M7 5h3v14H7zM14 5h3v14h-3z" fill="currentColor"/>'),
    sound: P('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/>'),
    mute: P('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l4 6M21 9l-4 6"/>'),
    open: P('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
    rotl: P('<path d="M4 4v6h6"/><path d="M4.5 10A8 8 0 1 1 6 16.5"/>'),
    rotr: P('<path d="M20 4v6h-6"/><path d="M19.5 10A8 8 0 1 0 18 16.5"/>'),
    flip: P('<path d="M12 3v18M8 7L3 12l5 5zM16 7l5 5-5 5z"/>'),
    crop: P('<path d="M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14"/>'),
    bold: P('<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/>'),
    alignL: P('<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>'),
    alignC: P('<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>'),
    alignR: P('<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>'),
    minus: P('<path d="M5 12h14"/>'),
    focus: P('<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5M11 8v6M8 11h6"/>'),
    fit: P('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/><rect x="8" y="8" width="8" height="8" rx="1"/>'),
    shrink: P('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'),
    unlink: P('<path d="M9 15l-1.5 1.5a3.5 3.5 0 0 1-5-5L5 9M15 9l1.5-1.5a3.5 3.5 0 0 1 5 5L19 15M8 2v3M2 8h3M16 22v-3M22 16h-3"/>'),
    plus: P('<path d="M12 5v14M5 12h14"/>'),
    pdf: P('<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/><path d="M8.5 16.5v-4h1.2a1.2 1.2 0 0 1 0 2.4H8.5M12.5 16.5v-4h1a2 2 0 0 1 0 4zM17 12.5h-1.5v4M15.5 14.5h1.2"/>'),
    doc: P('<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>'),
    audio: P('<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'),
    video: P('<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>'),
    image: P('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>'),
  };
  const icon = (name) => { const s = document.createElement('i'); s.dataset.i = name; s.innerHTML = ICON[name] || ''; return s; };
  document.querySelectorAll('i[data-i]').forEach((n) => { n.innerHTML = ICON[n.dataset.i] || ''; });

  const FONTS = {
    sans: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    serif: 'Georgia, "Times New Roman", serif',
    mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
    hand: '"Segoe Print", "Bradley Hand", "Marker Felt", "Comic Sans MS", cursive',
  };

  function h(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v; // solo con constantes propias (iconos)
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids) if (k != null) n.append(k);
    return n;
  }
  const getEl = (id) => state.elements.find((e) => e.id === id);
  const isMedia = (e) => e.kind === 'image' || e.kind === 'video';
  const extOf = (name) => (String(name).split('.').pop() || '').toUpperCase().slice(0, 5);
  const fmtTime = (t) => new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  let toastT = null;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2600);
  }

  // ---------- Conexión ----------
  function showLogin(err) {
    $('#login').hidden = false; $('#loginErr').textContent = err || '';
    setTimeout(() => $('#pinInput').focus(), 30);
  }
  $('#loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    pin = $('#pinInput').value.trim();
    if (!pin) return;
    try { sessionStorage.setItem('pv-pin', pin); } catch {}
    $('#login').hidden = true; connect();
  });

  function connect() {
    if (socket) { socket.removeAllListeners(); socket.disconnect(); }
    socket = io({ auth: { role: MODE, pin } });
    socket.on('connect', () => $('#conn').classList.add('on'));
    socket.on('disconnect', () => $('#conn').classList.remove('on'));
    socket.on('state', (s) => {
      // Si acabo de mover la cámara, mi vista manda (el servidor puede ir un instante por detrás)
      if (MODE === 'admin' && Date.now() - lastCamLocal < 800 && state.settings && s.settings) s.settings.camera = state.settings.camera;
      state = s; render();
    });
    socket.on('camera', (c) => { if (state.settings) { state.settings.camera = c; applyCamera(); } });
    socket.on('auth-error', () => {
      try { sessionStorage.removeItem('pv-pin'); } catch {}
      showLogin('PIN incorrecto');
    });
  }

  fetch('/api/info').then((r) => r.json()).then((info) => {
    const shortUrl = info.uploadUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    for (const id of ['#qrImg', '#heroImg', '#feedQr']) $(id).src = info.qr;
    for (const id of ['#qrUrl', '#heroUrl', '#feedUrl']) $(id).textContent = shortUrl;
  }).catch(() => {});

  // Envío de cambios agrupado (evita saturar la red al arrastrar)
  const pending = new Map(); let flushT = null;
  function queue(id, patch) {
    pending.set(id, { ...(pending.get(id) || {}), ...patch });
    if (!flushT) flushT = setTimeout(flush, 45);
  }
  function flush() {
    clearTimeout(flushT); flushT = null;
    for (const [id, patch] of pending) socket && socket.emit('update', { id, patch });
    pending.clear();
  }
  function update(id, patch) {
    const el = getEl(id);
    if (el) { if (patch.w && el.kind !== 'text' && el.w) scaleChildren(el.id, patch.w / el.w); Object.assign(el, patch); }
    queue(id, patch); flush(); render();
  }
  // Igual que en el servidor: los textos anclados crecen y encogen con su foto
  function scaleChildren(parentId, k) {
    if (!Number.isFinite(k) || k <= 0 || Math.abs(k - 1) < 1e-6) return;
    for (const c of state.elements) {
      if (c.parent !== parentId) continue;
      c.x = Math.round(c.x * k * 10) / 10; c.y = Math.round(c.y * k * 10) / 10;
      c.w = Math.min(4000, Math.max(30, Math.round(c.w * k)));
      if (c.style) c.style = { ...c.style, size: Math.min(400, Math.max(6, Math.round((c.style.size || 48) * k * 10) / 10)) };
      const n = nodes.get(c.id); if (n) updateNode(n, c);
    }
  }
  const parentOf = (el) => (el && el.parent ? getEl(el.parent) : null);
  const frameRot = (el) => { const p = parentOf(el); return p ? (p.rot || 0) : 0; };

  // ---------- Escala del tablero ----------
  function fit() {
    const r = wrap.getBoundingClientRect();
    if (!r.width || !r.height) return;
    scale = Math.max(0.05, Math.min(r.width / BW, r.height / BH));
    view.w = r.width / scale; view.h = r.height / scale;
    view.ox = (view.w - BW) / 2; view.oy = (view.h - BH) / 2;
    board.style.width = view.w + 'px'; board.style.height = view.h + 'px';
    board.style.transform = `scale(${scale})`;
    applyCamera();
  }

  // ---------- Cámara: zoom y desplazamiento del muro, compartidos con /pantalla ----------
  // cam.z = 1 → la zona de referencia (1920×1080) llena la pantalla. Menos de 1 = más alejado.
  const cam = { x: BW / 2, y: BH / 2, z: 1 };
  function autoCamera() {
    // Encaja todas las fotos visibles (nunca acerca más que la vista normal)
    let x0 = 0, y0 = 0, x1 = BW, y1 = BH;
    for (const e of state.elements) {
      if (e.status !== 'live' || e.hidden || e.parent) continue;
      const hh = e.kind === 'text' ? (nodes.get(e.id)?.offsetHeight || e.h) : e.h;
      x0 = Math.min(x0, e.x); y0 = Math.min(y0, e.y); x1 = Math.max(x1, e.x + e.w); y1 = Math.max(y1, e.y + hh);
    }
    // Márgenes en píxeles de pantalla (no del muro): siempre libre la franja del título
    // y, si se ve el QR de la esquina, una columna libre a la derecha para que no tape fotos
    const qr = state.settings && state.settings.showQr && !$('#qrBox').hidden;
    const TOP = 110, LEFT = 30, RIGHT = qr ? 330 : 30, BOT = 30;
    const z = Math.min(1, (BW - LEFT - RIGHT) / (x1 - x0), (BH - TOP - BOT) / (y1 - y0));
    return { x: (x0 + x1) / 2 + (RIGHT - LEFT) / 2 / z, y: (y0 + y1) / 2 - (TOP - BOT) / 2 / z, z };
  }
  function applyCamera() {
    const c = (state.settings && state.settings.camera) || { mode: 'auto' };
    // Mientras arrastras algo la cámara no se mueve, para que no salte bajo el cursor
    if (!(action && action.type !== 'pan' && action.type !== 'pinch')) {
      const t = c.mode === 'manual' ? c : autoCamera();
      cam.x = t.x; cam.y = t.y; cam.z = t.z;
    }
    const tx = view.w / 2 - cam.x * cam.z, ty = view.h / 2 - cam.y * cam.z;
    space.style.transform = `translate(${tx}px, ${ty}px) scale(${cam.z})`;
    board.style.setProperty('--inv', String(1 / (scale * cam.z)));
    if (MODE === 'admin') { renderToolbar(true); renderZoomUi(); }
  }
  new ResizeObserver(fit).observe(wrap);
  window.addEventListener('resize', fit);

  function luminance(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 0;
    const n = parseInt(m[1], 16); const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }

  // ---------- Render ----------
  function render() {
    const s = state.settings || {};
    board.style.background = s.background || '#14161b';
    board.style.color = luminance(s.background) > 0.45 ? '#15171b' : '#ffffff';
    $('#boardTitle').textContent = s.title || '';
    // Sin archivos en el muro: QR a pantalla completa (si está activado)
    const files = state.elements.filter((e) => e.status === 'live' && !e.hidden && e.kind !== 'text').length;
    const hero = Boolean(s.qrFull) || (s.bigQr !== false && files === 0);
    $('#qrHero').hidden = !hero;
    $('#qrHero').classList.toggle('cover', Boolean(s.qrFull) && files > 0);
    $('#qrHero').style.background = s.qrFull && files > 0 ? (s.background || '#14161b') : '';
    $('#heroTitle').textContent = s.title || '';
    $('#boardTitle').hidden = hero;
    $('#qrBox').hidden = !s.showQr || hero;

    const live = state.elements.filter((e) => e.status === 'live' && (MODE === 'admin' || !e.hidden));
    const seen = new Set();
    let arrivals = 0;
    // Primero fotos y textos sueltos; después los textos anclados, dentro de su foto
    const roots = live.filter((e) => !e.parent), kids = live.filter((e) => e.parent);
    for (const el of [...roots, ...kids]) {
      const local = action && action.id === el.id && action.geom ? action.geom
        : recent && recent.id === el.id && Date.now() < recent.until ? recent.geom : null;
      if (local) {
        if (local.w && el.kind !== 'text' && el.w) {
          // Ajusta también sus textos (aún vienen del servidor con el tamaño anterior)
          const k = local.w / el.w;
          for (const c of state.elements) if (c.parent === el.id) {
            c.x = Math.round(c.x * k * 10) / 10; c.y = Math.round(c.y * k * 10) / 10; c.w = Math.round(c.w * k);
            if (c.style) c.style = { ...c.style, size: Math.round((c.style.size || 48) * k * 10) / 10 };
          }
        }
        Object.assign(el, local);
      }
      const host = el.parent ? nodes.get(el.parent) : space;
      if (!host || (el.parent && !seen.has(el.parent))) continue; // su foto no está visible
      let n = nodes.get(el.id);
      if (!n) {
        n = createNode(el); nodes.set(el.id, n);
        if (initialized) { n.classList.add('enter'); setTimeout(() => n.classList.remove('enter'), 700); }
      }
      if (n.parentNode !== host) host.appendChild(n);
      updateNode(n, el); seen.add(el.id);
    }
    for (const [id, n] of nodes) if (!seen.has(id)) { n.remove(); nodes.delete(id); }
    for (const e of state.elements) {
      if (!known.has(e.id)) { known.add(e.id); if (initialized && e.kind !== 'text') arrivals++; }
    }
    if (selectedId && !getEl(selectedId)) selectedId = null;
    $('#empty').hidden = live.length > 0 || hero;

    if (MODE === 'admin') {
      if (arrivals) toast(arrivals === 1 ? 'Ha llegado un archivo nuevo' : `Han llegado ${arrivals} archivos nuevos`);
      renderTopbar(); renderSide(); renderToolbar();
    }
    renderSpotlight();
    renderFeed();
    applyCamera();
    initialized = true;
  }

  function createNode(el) {
    const n = h('div', { class: 'el kind-' + el.kind });
    n.dataset.id = el.id;
    n.append(h('div', { class: 'content' }), h('div', { class: 'caption' }));
    if (MODE === 'admin') n.append(h('div', { class: 'handle h-resize', 'data-h': 'resize' }), h('div', { class: 'handle h-rotate', 'data-h': 'rotate' }));
    return n;
  }

  function updateNode(n, el) {
    n.style.left = el.x + 'px'; n.style.top = el.y + 'px'; n.style.width = el.w + 'px';
    n.style.height = el.kind === 'text' ? 'auto' : el.h + 'px';
    n.style.transform = `rotate(${el.rot || 0}deg)`;
    n.style.zIndex = String(1000 + (el.z || 0));
    n.classList.toggle('is-hidden', Boolean(el.hidden));
    n.classList.toggle('selected', el.id === selectedId);
    const c = n.firstChild;
    if (el.kind === 'text') updateText(c, el); else updateMedia(n, c, el);
    const cap = n.children[1];
    const capText = el.kind !== 'text' && el.showCaption
      ? [el.message, el.author ? '— ' + el.author : ''].filter(Boolean).join('  ') : '';
    cap.textContent = capText; cap.hidden = !capText;
  }

  function updateText(c, el) {
    const st = el.style || {};
    let b = c.firstChild;
    if (!b) { b = h('div', { class: 'textbox' }); c.append(b); }
    if (editingId !== el.id && b.textContent !== el.text) b.textContent = el.text;
    styleText(b, st, 1);
  }
  function styleText(b, st, k) {
    b.style.color = st.color || '#fff';
    b.style.background = st.bg || 'transparent';
    b.style.fontSize = (st.size || 48) * k + 'px';
    b.style.fontWeight = st.bold ? '750' : '400';
    b.style.textAlign = st.align || 'center';
    b.style.fontFamily = FONTS[st.font] || FONTS.sans;
  }

  let soundBlocked = false;
  function updateMedia(n, c, el) {
    const key = el.kind + '|' + el.file.url;
    if (n._key !== key) { n._key = key; buildMedia(c, el); }
    const m = c.querySelector('video, audio');
    if (m) {
      const muted = el.muted ?? (el.kind === 'video');
      m.muted = muted;
      if (el.playing && m.paused) {
        m.play().catch(() => {
          if (MODE === 'view' && !muted) { soundBlocked = true; $('#soundHint').hidden = false; m.muted = true; m.play().catch(() => {}); }
        });
      } else if (!el.playing && !m.paused) m.pause();
      n.classList.toggle('paused', !el.playing);
    }
  }
  function buildMedia(c, el) {
    c.textContent = '';
    if (el.kind === 'image') c.append(h('img', { src: el.file.url, alt: el.message || el.file.name, draggable: 'false' }));
    else if (el.kind === 'video') { const v = h('video', { src: el.file.url + '#t=0.1', playsinline: true, loop: true, preload: 'metadata' }); v.muted = true; c.append(v); }
    else if (el.kind === 'audio') c.append(h('div', { class: 'filecard' }, iconBox('audio'), h('div', { class: 'fname', text: el.file.name }), h('audio', { src: el.file.url, preload: 'metadata', loop: true })));
    else c.append(h('div', { class: 'filecard' }, iconBox(el.kind), h('div', { class: 'fname', text: el.file.name }),
      h('div', { class: 'fmeta', text: (el.kind === 'pdf' ? 'PDF' : extOf(el.file.name)) + (el.author ? ' · ' + el.author : '') })));
  }
  function iconBox(kind) { return h('div', { class: 'ficon', html: ICON[kind] || ICON.doc }); }

  if (MODE === 'view') {
    document.addEventListener('click', () => {
      if (!soundBlocked) return;
      soundBlocked = false; $('#soundHint').hidden = true;
      nodes.forEach((n) => { n._key = null; }); render();
    });
  }

  // ---------- Destacado en /pantalla ----------
  let spotKey = null;
  function renderSpotlight() {
    const id = state.settings && state.settings.spotlight;
    const el = id && getEl(id);
    if (MODE !== 'view' || !el || !isMedia(el)) { $('#spot').hidden = true; spotKey = null; const v = $('#spotMedia video'); if (v) v.pause(); return; }
    $('#spot').hidden = false;
    const key = el.id + '|' + el.file.url;
    if (spotKey !== key) {
      spotKey = key; const box = $('#spotMedia'); box.textContent = '';
      if (el.kind === 'image') box.append(h('img', { src: el.file.url, alt: '' }));
      else { const v = h('video', { src: el.file.url, playsinline: true, loop: true, autoplay: true }); v.muted = el.muted ?? true; box.append(v); v.play().catch(() => {}); }
    }
    $('#spotCap').textContent = [el.message, el.author ? '— ' + el.author : ''].filter(Boolean).join('  ');
  }

  // ---------- /pantalla en vertical (móvil): fotos a todo el ancho, una debajo de otra ----------
  const feedCards = new Map();
  const captionOf = (el) => (el.showCaption ? [el.message, el.author ? '— ' + el.author : ''].filter(Boolean).join('  ') : '');
  function renderFeed() {
    if (MODE !== 'view') return;
    const on = innerWidth < innerHeight * 0.95;
    document.body.classList.toggle('feed', on);
    if (!on) return;
    const s = state.settings || {};
    const feed = $('#feed');
    feed.style.background = s.background || '#14161b';
    feed.style.color = luminance(s.background) > 0.45 ? '#15171b' : '#ffffff';
    $('#feedTitle').textContent = s.title || '';
    const list = $('#feedList');
    const W = list.clientWidth || innerWidth - 24;
    const roots = state.elements.filter((e) => e.status === 'live' && !e.hidden && !e.parent).sort((a, b) => b.createdAt - a.createdAt);
    const seen = new Set();
    roots.forEach((el, i) => {
      let card = feedCards.get(el.id);
      if (!card) {
        card = h('div', { class: 'fcard' });
        if (initialized) { card.classList.add('enter'); setTimeout(() => card.classList.remove('enter'), 700); }
        feedCards.set(el.id, card);
      }
      seen.add(el.id);
      if (list.children[i] !== card) list.insertBefore(card, list.children[i] || null);
      fillCard(card, el, W);
    });
    for (const [id, c] of feedCards) if (!seen.has(id)) { c.remove(); feedCards.delete(id); }
    const hero = Boolean(s.qrFull) || (s.bigQr !== false && !roots.some((e) => e.kind !== 'text'));
    $('#feedEmpty').hidden = roots.length > 0 && !hero;
    list.hidden = Boolean(s.qrFull);
    $('#feedEmpty').classList.toggle('is-hero', hero);
    $('#feedTitle').classList.toggle('is-hero', hero);
  }
  function fillCard(card, el, W) {
    card.classList.toggle('is-text', el.kind === 'text');
    if (el.kind === 'text') {
      card._key = null; card.style.height = ''; card.textContent = '';
      const b = h('div', { class: 'textbox', text: el.text });
      styleText(b, el.style || {}, Math.min(1, W / el.w)); card.append(b);
      return;
    }
    const k = W / el.w;
    card.style.height = Math.round(el.h * k) + 'px';
    const key = el.kind + '|' + el.file.url;
    if (card._key !== key) {
      card._key = key; card.textContent = '';
      const inner = h('div', { class: 'el finner kind-' + el.kind }, h('div', { class: 'content' }), h('div', { class: 'caption' }), h('div', { class: 'ftexts' }));
      card.append(inner); buildMedia(inner.firstChild, el);
    }
    const inner = card.firstChild;
    inner.style.width = el.w + 'px'; inner.style.height = el.h + 'px'; inner.style.transform = `scale(${k})`;
    const cap = inner.children[1], capText = captionOf(el); cap.textContent = capText; cap.hidden = !capText;
    const m = inner.querySelector('video, audio');
    if (m) {
      m.muted = el.muted ?? (el.kind === 'video');
      if (el.playing && m.paused) m.play().catch(() => { m.muted = true; m.play().catch(() => {}); });
      else if (!el.playing && !m.paused) m.pause();
    }
    // Textos anclados: mismas posiciones relativas, escalados con la foto
    const tl = inner.children[2]; tl.textContent = '';
    for (const c of state.elements) {
      if (c.parent !== el.id || c.hidden || c.status !== 'live') continue;
      const n = h('div', { class: 'ftext' });
      n.style.left = c.x + 'px'; n.style.top = c.y + 'px'; n.style.width = c.w + 'px'; n.style.transform = `rotate(${c.rot || 0}deg)`;
      const b = h('div', { class: 'textbox', text: c.text }); styleText(b, c.style || {}, 1); n.append(b); tl.append(n);
    }
  }

  if (MODE === 'view') {
    let rT = null;
    window.addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(renderFeed, 80); });
    // Botón de pantalla completa (se esconde solo)
    const fs = $('#fsBtn');
    const canFs = Boolean(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
    let fsT = null;
    const showFs = () => {
      if (!canFs || document.fullscreenElement || document.webkitFullscreenElement) { fs.hidden = true; return; }
      fs.hidden = false; fs.classList.remove('fade'); clearTimeout(fsT); fsT = setTimeout(() => fs.classList.add('fade'), 3500);
    };
    fs.onclick = (e) => {
      e.stopPropagation();
      const d = document.documentElement;
      (d.requestFullscreen ? d.requestFullscreen() : d.webkitRequestFullscreen()).catch?.(() => {});
    };
    ['pointermove', 'pointerdown'].forEach((ev) => document.addEventListener(ev, showFs, { passive: true }));
    document.addEventListener('fullscreenchange', showFs);
    document.addEventListener('webkitfullscreenchange', showFs);
    showFs();
    connect(); return;
  }

  // =====================================================================
  //  A partir de aquí: solo panel del presentador
  // =====================================================================

  // ---------- Barra superior ----------
  function renderTopbar() {
    const s = state.settings;
    const ti = $('#titleInput'); if (document.activeElement !== ti) ti.value = s.title || '';
    const bg = $('#bgInput'); if (document.activeElement !== bg) bg.value = /^#[0-9a-f]{6}$/i.test(s.background) ? s.background : '#14161b';
    $('#qrBtn').classList.toggle('on', Boolean(s.showQr));
    $('#bigQrBtn').classList.toggle('on', Boolean(s.qrFull));
    $('#openBtn').classList.toggle('on', Boolean(s.uploadsOpen));
    $('#openBtn').lastChild.textContent = s.uploadsOpen ? 'Subidas' : 'Cerradas';
    $('#openBtn').title = s.uploadsOpen ? 'Subidas abiertas: pulsa para cerrarlas' : 'Subidas cerradas: pulsa para abrirlas';
    $('#modBtn').classList.toggle('on', Boolean(s.moderation));
    $('#spotStop').hidden = !s.spotlight || !$('#lightbox').hidden;
    const live = state.elements.filter((e) => e.status === 'live' && e.kind !== 'text').length;
    const pend = state.elements.filter((e) => e.status === 'pending').length;
    $('#counter').textContent = `${live} en el panel` + (pend ? ` · ${pend} pendientes` : '');
  }
  const setting = (patch) => { Object.assign(state.settings, patch); socket.emit('settings', patch); render(); };
  let titleT = null;
  $('#titleInput').addEventListener('input', (e) => { clearTimeout(titleT); const v = e.target.value; titleT = setTimeout(() => setting({ title: v }), 250); });
  $('#titleInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
  let bgT = null;
  $('#bgInput').addEventListener('input', (e) => { const v = e.target.value; board.style.background = v; clearTimeout(bgT); bgT = setTimeout(() => setting({ background: v }), 120); });
  $('#qrBtn').onclick = () => setting({ showQr: !state.settings.showQr });
  $('#bigQrBtn').onclick = () => {
    const on = !state.settings.qrFull; setting({ qrFull: on });
    toast(on ? 'QR a pantalla completa en /pantalla. Pulsa otra vez para volver a las fotos' : 'De vuelta a las fotos');
  };
  $('#openBtn').onclick = () => setting({ uploadsOpen: !state.settings.uploadsOpen });
  $('#modBtn').onclick = () => {
    const on = !state.settings.moderation; setting({ moderation: on });
    toast(on ? 'Moderación activada: lo nuevo esperará en «Pendiente»' : 'Moderación desactivada: lo nuevo aparece directamente');
  };
  $('#spotStop').onclick = () => setting({ spotlight: '' });
  const isNarrow = () => matchMedia('(max-width: 900px)').matches;
  $('#sideBtn').onclick = () => { document.body.classList.toggle(isNarrow() ? 'side-open' : 'side-closed'); fit(); };
  $('#clearBtn').onclick = () => {
    if (!state.elements.length) return;
    if (confirm('¿Vaciar el panel? Se borrarán TODOS los archivos y textos. No se puede deshacer.')) { socket.emit('clear-all'); selectedId = null; }
  };
  $('#presentBtn').onclick = async () => {
    document.body.classList.add('presenting'); select(null);
    try { await document.documentElement.requestFullscreen(); } catch {}
    fit(); toast('Pulsa Esc para salir del modo presentación');
  };
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) { document.body.classList.remove('presenting'); fit(); }
  });

  $('#addText').onclick = () => {
    const sel = selectedId && getEl(selectedId);
    const photo = sel && (sel.kind !== 'text' ? sel : parentOf(sel));
    stopEditing();
    const opts = photo ? { parent: photo.id } : { x: Math.round(BW / 2 - 300), y: Math.round(BH / 2 - 70) };
    if (photo) toast('Texto anclado a la foto: se moverá con ella');
    socket.emit('add-text', opts, (id) => {
      setTimeout(() => { selectedId = id; render(); startEditing(id); }, 30);
    });
  };

  // Disposición automática
  function layoutArea() {
    const top = 110, pad = 34, qr = state.settings.showQr ? 330 : 0;
    return { x: pad, y: top, w: BW - pad * 2 - qr, h: BH - top - pad };
  }
  $('#gridBtn').onclick = () => {
    const items = state.elements.filter((e) => e.status === 'live' && !e.hidden && e.kind !== 'text').sort((a, b) => a.createdAt - b.createdAt);
    if (!items.length) return toast('Todavía no hay archivos que ordenar');
    const A = layoutArea(); let best = null;
    for (let cols = 1; cols <= items.length; cols++) {
      const rows = Math.ceil(items.length / cols), cw = A.w / cols, ch = A.h / rows;
      const score = Math.min(cw, ch * 4 / 3);
      if (!best || score > best.score) best = { cols, rows, cw, ch, score };
    }
    let gap = 18;
    if (best.score < 300) {
      // Demasiadas para la pantalla: cuadrícula más grande que crece y la cámara se aleja
      const cw = 340, ch = 270, cols = Math.max(1, Math.round(Math.sqrt(items.length * (BW / BH) * (ch / cw))));
      const rows = Math.ceil(items.length / cols), W = cols * cw, H = rows * ch;
      A.x = BW / 2 - W / 2; A.y = BH / 2 + 40 - H / 2; best = { cols, rows, cw, ch };
    }
    const pos = items.map((el, i) => {
      const c = i % best.cols, r = Math.floor(i / best.cols), ratio = el.w / el.h;
      let w = best.cw - gap, hh = w / ratio;
      if (hh > best.ch - gap) { hh = best.ch - gap; w = hh * ratio; }
      return { id: el.id, x: Math.round(A.x + c * best.cw + (best.cw - w) / 2), y: Math.round(A.y + r * best.ch + (best.ch - hh) / 2), w: Math.round(w), h: Math.round(hh), rot: 0 };
    });
    socket.emit('layout', pos); setAutoCamera();
  };
  $('#collageBtn').onclick = () => {
    const items = state.elements.filter((e) => e.status === 'live' && !e.hidden && e.kind !== 'text')
      .map((e) => ({ e, r: Math.random() })).sort((a, b) => a.r - b.r).map((o) => o.e);
    if (!items.length) return toast('Todavía no hay archivos que colocar');
    // Cuadrícula desordenada: cada foto en su celda con un poco de desplazamiento y giro
    const A = layoutArea();
    let cols = Math.max(1, Math.round(Math.sqrt(items.length * (A.w / A.h) * 0.8)));
    let rows = Math.ceil(items.length / cols);
    let cw = A.w / cols, ch = A.h / rows;
    if (Math.min(cw, ch * 4 / 3) < 330) { // no caben bien: el muro crece
      cw = 360; ch = 290; cols = Math.max(1, Math.round(Math.sqrt(items.length * (BW / BH) * (ch / cw)))); rows = Math.ceil(items.length / cols);
      A.w = cols * cw; A.h = rows * ch; A.x = BW / 2 - A.w / 2; A.y = BH / 2 + 40 - A.h / 2;
    }
    const pos = items.map((el, i) => {
      const c = i % cols, r = Math.floor(i / cols), ratio = el.w / el.h;
      let w = cw * (0.82 + Math.random() * 0.12), hh = w / ratio;
      if (hh > ch * 0.9) { hh = ch * 0.9; w = hh * ratio; }
      const jx = (Math.random() - 0.5) * (cw - w) * 0.9, jy = (Math.random() - 0.5) * (ch - hh) * 0.9;
      return { id: el.id, x: Math.round(A.x + c * cw + (cw - w) / 2 + jx), y: Math.round(A.y + r * ch + (ch - hh) / 2 + jy), w: Math.round(w), h: Math.round(hh), rot: Math.round((Math.random() - 0.5) * 12) };
    });
    socket.emit('layout', pos); setAutoCamera();
  };

  // ---------- Controles de cámara ----------
  const touches = new Map();
  let camT = null, camPending = null;
  function setCamera(c, animate) {
    const z = Math.min(12, Math.max(0.03, c.z));
    state.settings.camera = { mode: 'manual', x: c.x, y: c.y, z }; lastCamLocal = Date.now();
    if (animate) { space.classList.add('cam-anim'); setTimeout(() => space.classList.remove('cam-anim'), 450); }
    applyCamera();
    camPending = state.settings.camera;
    if (!camT) camT = setTimeout(() => { camT = null; socket.emit('camera', camPending); }, 60);
  }
  function setAutoCamera() {
    state.settings.camera = { mode: 'auto' }; lastCamLocal = Date.now();
    space.classList.add('cam-anim'); setTimeout(() => space.classList.remove('cam-anim'), 450);
    applyCamera(); socket.emit('camera', { mode: 'auto' });
  }
  // Zoom manteniendo fijo el punto bajo el cursor (o los dedos)
  // center (0–1): cuánto se acerca el punto al centro de la vista en este paso
  function zoomCameraAt(clientX, clientY, z, anchor, center = 0) {
    z = Math.min(12, Math.max(0.03, z));
    const p = anchor || toSpaceXY(clientX, clientY);
    const r = board.getBoundingClientRect();
    const bx = (clientX - r.left) / scale, by = (clientY - r.top) / scale;
    let x = p.x - (bx - view.w / 2) / z, y = p.y - (by - view.h / 2) / z;
    if (center > 0) { x += (p.x - x) * center; y += (p.y - y) * center; }
    setCamera({ x, y, z });
  }
  function startPinch() {
    const [a, b] = [...touches.values()];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    action = { type: 'pinch', d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), z0: cam.z, anchor: toSpaceXY(mx, my) };
  }
  function focusOn(el) {
    const t = el.parent ? parentOf(el) : el; if (!t) return;
    const hh = t.kind === 'text' ? (nodes.get(t.id)?.offsetHeight || t.h) : t.h;
    const z = Math.min(8, BW / (t.w + 120), (BH - 140) / (hh + 80));
    setCamera({ x: t.x + t.w / 2, y: t.y + hh / 2 - 40 / z, z }, true);
  }
  function renderZoomUi() {
    const c = state.settings && state.settings.camera;
    $('#zoomPct').textContent = Math.round(cam.z * 100) + '%';
    $('#zoomAll').classList.toggle('on', !c || c.mode !== 'manual');
  }
  const zoomStep = (k) => { const r = wrap.getBoundingClientRect(); zoomCameraAt(r.left + r.width / 2, r.top + r.height / 2, cam.z * k); };
  $('#zoomIn').onclick = () => zoomStep(1.25);
  $('#zoomOut').onclick = () => zoomStep(1 / 1.25);
  $('#zoomPct').onclick = () => setCamera({ x: BW / 2, y: BH / 2, z: 1 }, true);
  $('#zoomAll').onclick = () => setAutoCamera();

  // ---------- Selección e interacción en el tablero ----------
  function select(id) {
    if (selectedId === id) return;
    selectedId = id;
    nodes.forEach((n, nid) => n.classList.toggle('selected', nid === id));
    renderToolbar(); renderSide();
  }
  // Coordenadas de pantalla → coordenadas del muro
  function toSpaceXY(cx, cy) { const r = space.getBoundingClientRect(); return { x: (cx - r.left) / (scale * cam.z), y: (cy - r.top) / (scale * cam.z) }; }
  const toBoard = (e) => toSpaceXY(e.clientX, e.clientY);
  function nodeCenter(n) { const r = n.getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; }
  // Foto que hay debajo del centro de un texto (para anclarlo al soltarlo)
  function photoUnder(n) {
    const { cx, cy } = nodeCenter(n);
    const prev = n.style.pointerEvents; n.style.pointerEvents = 'none';
    const stack = document.elementsFromPoint(cx, cy);
    n.style.pointerEvents = prev;
    for (const hit of stack) {
      const en = hit.closest && hit.closest('.el'); if (!en || en === n || n.contains(en)) continue;
      const t = getEl(en.dataset.id); if (t && t.kind !== 'text') return t;
    }
    return null;
  }
  let dropTarget = null;
  function markDrop(t) {
    if (dropTarget === (t && t.id)) return;
    if (dropTarget && nodes.get(dropTarget)) nodes.get(dropTarget).classList.remove('drop-target');
    dropTarget = t ? t.id : null;
    if (dropTarget && nodes.get(dropTarget)) nodes.get(dropTarget).classList.add('drop-target');
  }
  // Ancla o suelta un texto según dónde haya quedado
  function reparent(el, detach) {
    const n = nodes.get(el.id); if (!n) return;
    const target = detach ? null : photoUnder(n);
    if ((target ? target.id : null) === (el.parent || null)) return;
    const { cx, cy } = nodeCenter(n), c = toSpaceXY(cx, cy);
    const vis = (el.rot || 0) + frameRot(el), tw = el.w, th = n.offsetHeight;
    let patch;
    if (target) {
      const a = -(target.rot || 0) * Math.PI / 180, vx = c.x - (target.x + target.w / 2), vy = c.y - (target.y + target.h / 2);
      const lx = vx * Math.cos(a) - vy * Math.sin(a) + target.w / 2, ly = vx * Math.sin(a) + vy * Math.cos(a) + target.h / 2;
      patch = { parent: target.id, x: Math.round(lx - tw / 2), y: Math.round(ly - th / 2), rot: Math.round((vis - (target.rot || 0)) * 10) / 10 };
      toast('Texto anclado a la foto: se moverá con ella');
    } else {
      patch = { parent: null, x: Math.round(c.x - tw / 2), y: Math.round(c.y - th / 2), rot: Math.round(vis * 10) / 10 };
      toast('Texto suelto: ya no va con la foto');
    }
    recent = null; Object.assign(el, patch); queue(el.id, patch); flush();
    if (!target) socket.emit('front', el.id); // que no quede detrás de otras fotos
    render();
  }

  board.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const n = e.target.closest('.el');
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!n || (action && (action.type === 'pan' || action.type === 'pinch'))) {
      // Fondo: arrastrar desplaza el muro; dos dedos hacen zoom
      stopEditing();
      if (touches.size >= 2 && action) { startPinch(); }
      else if (!n) action = { type: 'pan', sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false };
      board.setPointerCapture(e.pointerId);
      return;
    }
    const id = n.dataset.id, el = getEl(id); if (!el) return;
    if (editingId === id) return; // escribiendo dentro del texto
    stopEditing(); select(id);
    // Lo que tocas pasa al frente
    if (!el.parent && state.elements.some((o) => !o.parent && o.id !== id && (o.z || 0) >= (el.z || 0))) socket.emit('front', id);
    const p = toBoard(e), hd = e.target.dataset.h;
    action = { type: hd || 'move', id, start: p, moved: false, geom: null,
      orig: { x: el.x, y: el.y, w: el.w, h: el.h, rot: el.rot || 0, size: (el.style && el.style.size) || 48 } };
    if (hd === 'rotate') { const { cx, cy } = nodeCenter(n); const c = toSpaceXY(cx, cy); action.cx = c.x; action.cy = c.y; }
    action.frame = frameRot(el);
    board.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  board.addEventListener('pointermove', (e) => {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!action) return;
    if (action.type === 'pan') {
      const dx = e.clientX - action.sx, dy = e.clientY - action.sy;
      if (!action.moved && Math.hypot(dx, dy) < 4) return;
      action.moved = true;
      setCamera({ x: action.cx - dx / (scale * cam.z), y: action.cy - dy / (scale * cam.z), z: cam.z });
      return;
    }
    if (action.type === 'pinch') {
      const [a, b] = [...touches.values()]; if (!b) return;
      const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const z = action.z0 * d / action.d0;
      zoomCameraAt(mx, my, z, action.anchor);
      return;
    }
    const p = toBoard(e), o = action.orig, dx = p.x - action.start.x, dy = p.y - action.start.y;
    if (!action.moved && Math.hypot(dx, dy) * scale * cam.z < 3) return;
    action.moved = true;
    const el = getEl(action.id); if (!el) return;
    let g;
    if (action.type === 'move') {
      const a = -action.frame * Math.PI / 180;
      g = { x: Math.round(o.x + dx * Math.cos(a) - dy * Math.sin(a)), y: Math.round(o.y + dx * Math.sin(a) + dy * Math.cos(a)) };
    } else if (action.type === 'resize') {
      const a = -(o.rot + action.frame) * Math.PI / 180;
      const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
      if (el.kind === 'text') {
        const w = Math.max(80, o.w + lx), k = w / o.w;
        g = { w: Math.round(w), style: { ...el.style, size: Math.round(Math.max(10, Math.min(400, o.size * k))) } };
      } else if (!e.shiftKey && el.kind !== 'pdf' && el.kind !== 'doc' && el.kind !== 'audio') {
        const ratio = o.w / o.h;
        const w = Math.max(60, Math.abs(lx) >= Math.abs(ly * ratio) ? o.w + lx : (o.h + ly) * ratio);
        g = { w: Math.round(w), h: Math.round(w / ratio) };
      } else g = { w: Math.round(Math.max(60, o.w + lx)), h: Math.round(Math.max(40, o.h + ly)) };
    } else if (action.type === 'rotate') {
      let ang = Math.atan2(p.y - action.cy, p.x - action.cx) * 180 / Math.PI + 90;
      ang = ((ang + 540) % 360) - 180;
      if (e.shiftKey) ang = Math.round(ang / 15) * 15;
      else for (const t of [-180, -90, 0, 90, 180]) if (Math.abs(ang - t) < 3) ang = t;
      ang -= action.frame;
      g = { rot: Math.round(ang * 10) / 10 };
    }
    action.geom = { ...(action.geom || {}), ...g };
    if (g.w && el.kind !== 'text' && el.w) scaleChildren(el.id, g.w / el.w);
    Object.assign(el, g); updateNode(nodes.get(el.id), el); renderToolbar(true);
    if (el.kind === 'text' && action.type === 'move') markDrop(photoUnder(nodes.get(el.id)));
    queue(el.id, g);
  });

  const endAction = (e) => {
    if (e && e.pointerId != null) touches.delete(e.pointerId);
    if (!action) return;
    if (action.type === 'pinch') { if (touches.size === 0) action = null; return; }
    if (action.type === 'pan') { const a = action; action = null; if (!a.moved) select(null); return; }
    const a = action; action = null; markDrop(null);
    if (a.moved) {
      recent = { id: a.id, geom: a.geom, until: Date.now() + 600 }; flush();
      const el = getEl(a.id);
      if (el && el.kind === 'text' && a.type === 'move') reparent(el);
    }
  };
  board.addEventListener('pointerup', endAction);
  board.addEventListener('pointercancel', endAction);

  // Rueda o pellizco del trackpad: siempre zoom del muro (nunca cambia el tamaño de una foto),
  // hacia donde apunta el cursor; al acercar, esa zona se va centrando (también en /pantalla).
  let wheelFocus = null;
  board.addEventListener('wheel', (e) => {
    e.preventDefault();
    const z = Math.min(12, Math.max(0.03, cam.z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))));
    // El punto de interés se fija al empezar el gesto (o si mueves el ratón) y se va llevando al centro
    const now = Date.now(), wf = wheelFocus;
    if (!wf || now - wf.t > 450 || Math.hypot(e.clientX - wf.cx, e.clientY - wf.cy) > 25) {
      wheelFocus = { p: toSpaceXY(e.clientX, e.clientY), cx: e.clientX, cy: e.clientY, t: now };
    } else wf.t = now;
    const f = wheelFocus.p;
    const dx = (f.x - cam.x) * cam.z, dy = (f.y - cam.y) * cam.z; // distancia al centro, en píxeles del muro
    const k = z > cam.z ? 0.8 : 1; // al acercar, cada paso lo trae un 20 % más al centro
    setCamera({ x: f.x - (dx * k) / z, y: f.y - (dy * k) / z, z });
  }, { passive: false });

  board.addEventListener('dblclick', (e) => {
    // Con la captura del puntero el evento llega al tablero: buscamos el elemento bajo el cursor
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    const n = hit && hit.closest('.el'); if (!n) return;
    const el = getEl(n.dataset.id); if (!el) return;
    if (el.kind === 'text') startEditing(el.id);
    else if (isMedia(el)) openLightbox(el.id);
    else if (el.kind === 'audio') update(el.id, { playing: !el.playing });
    else window.open(el.file.url, '_blank', 'noopener');
  });

  function startEditing(id) {
    const n = nodes.get(id), el = getEl(id); if (!n || !el || el.kind !== 'text') return;
    const b = n.querySelector('.textbox');
    editingId = id;
    try { b.contentEditable = 'plaintext-only'; } catch { b.contentEditable = 'true'; }
    if (b.contentEditable !== 'plaintext-only') b.contentEditable = 'true';
    b.focus();
    const r = document.createRange(); r.selectNodeContents(b);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    b.oninput = () => queue(id, { text: b.innerText });
    b.onblur = () => stopEditing();
    b.onkeydown = (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); b.blur(); } };
    renderToolbar(true);
  }
  function stopEditing() {
    if (!editingId) return;
    const id = editingId; editingId = null;
    const n = nodes.get(id); if (!n) return;
    const b = n.querySelector('.textbox');
    b.contentEditable = 'false'; b.oninput = b.onblur = b.onkeydown = null;
    const text = b.innerText.replace(/\n$/, '');
    const el = getEl(id);
    if (el && !text.trim()) { flush(); socket.emit('delete', id); if (selectedId === id) select(null); toast('Texto vacío eliminado'); return; }
    if (el && el.text !== text) { el.text = text; queue(id, { text }); }
    flush();
  }

  // Tamaño: zoom alrededor del centro y «ampliar a pantalla»
  function zoomEl(el, k) {
    if (el.kind === 'text') {
      const size = Math.max(10, Math.min(400, Math.round((el.style.size || 48) * k)));
      const kk = size / (el.style.size || 48), w = Math.round(el.w * kk);
      update(el.id, { w, x: Math.round(el.x - (w - el.w) / 2), style: { ...el.style, size } });
    } else {
      const w = Math.max(60, Math.min(4000, el.w * k)), hh = w * el.h / el.w;
      update(el.id, { w: Math.round(w), h: Math.round(hh), x: Math.round(el.x - (w - el.w) / 2), y: Math.round(el.y - (hh - el.h) / 2) });
    }
  }
  const prevGeom = new Map();
  function toggleMax(el) {
    if (prevGeom.has(el.id)) { const g = prevGeom.get(el.id); prevGeom.delete(el.id); update(el.id, g); renderToolbar(); return; }
    prevGeom.set(el.id, { x: el.x, y: el.y, w: el.w, h: el.h, rot: el.rot || 0 });
    // Ocupa lo que se ve ahora mismo (deja libre la franja del título) y fija la cámara
    const z = cam.z, A = { x: cam.x - BW / 2 / z + 20 / z, y: cam.y - BH / 2 / z + 100 / z, w: (BW - 40) / z, h: (BH - 120) / z }, ratio = el.w / el.h;
    setCamera({ x: cam.x, y: cam.y, z: cam.z });
    let w = A.w, hh = w / ratio; if (hh > A.h) { hh = A.h; w = hh * ratio; }
    socket.emit('front', el.id);
    update(el.id, { x: Math.round(A.x + (A.w - w) / 2), y: Math.round(A.y + (A.h - hh) / 2), w: Math.round(w), h: Math.round(hh), rot: 0 });
    renderToolbar();
  }

  function removeEl(id) {
    const el = getEl(id); if (!el) return;
    const nTexts = state.elements.filter((c) => c.parent === id).length;
    if (el.kind !== 'text' && !confirm(`¿Eliminar «${el.file.name}»${nTexts ? ` y ${nTexts === 1 ? 'su texto' : `sus ${nTexts} textos`}` : ''}? Se borrará del servidor.`)) return;
    socket.emit('delete', id); if (selectedId === id) select(null);
  }

  document.addEventListener('keydown', (e) => {
    if (!$('#editor').hidden) { if (e.key === 'Escape') closeEditor(); return; }
    if (!$('#lightbox').hidden) {
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowLeft') stepLightbox(-1);
      else if (e.key === 'ArrowRight') stepLightbox(1);
      return;
    }
    if (e.target.closest('input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"]')) return;
    if (!selectedId) return;
    const el = getEl(selectedId); if (!el) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeEl(el.id); }
    else if (e.key === 'Escape') select(null);
    else if (e.key === 'Enter' && el.kind === 'text') { e.preventDefault(); startEditing(el.id); }
    else if (e.key.startsWith('Arrow')) {
      e.preventDefault(); const d = e.shiftKey ? 20 : 2;
      const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0;
      const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
      el.x += dx; el.y += dy; updateNode(nodes.get(el.id), el); renderToolbar(true); queue(el.id, { x: el.x, y: el.y });
    }
  });

  // ---------- Barra flotante de la selección ----------
  let tbSig = null;
  const TEXT_BG = [['transparent', 'Sin fondo'], ['rgba(0,0,0,0.55)', 'Oscuro'], ['rgba(255,255,255,0.92)', 'Claro'], ['#ffb84d', 'Ámbar'], ['#e5484d', 'Rojo'], ['#3e63dd', 'Azul']];
  function renderToolbar(positionOnly) {
    const tb = $('#toolbar');
    const el = selectedId && getEl(selectedId);
    const n = el && nodes.get(el.id);
    if (!el || !n || document.body.classList.contains('presenting') || !$('#lightbox').hidden || !$('#editor').hidden) { tb.hidden = true; tbSig = null; return; }
    const st = el.style || {};
    const sig = [el.id, el.parent, prevGeom.has(el.id), el.hidden, el.playing, el.muted, el.showCaption, st.bold, st.align, st.font, st.bg, el.file && el.file.url !== el.file.originalUrl].join('|');
    if (sig !== tbSig || tb.hidden) { buildToolbar(tb, el); tbSig = sig; }
    tb.hidden = false;
    const sz = tb.querySelector('.tb-size'); if (sz) sz.textContent = Math.round(st.size || 48);
    // Posición sobre el elemento
    const r = n.getBoundingClientRect(), tr = tb.getBoundingClientRect();
    const topLimit = ($('#topbar').getBoundingClientRect().bottom || 0) + 8;
    let top = r.top - tr.height - 48; // deja ver el asa de giro
    if (top < topLimit) top = Math.min(r.bottom + 14, innerHeight - tr.height - 8);
    const left = Math.max(8, Math.min(innerWidth - tr.width - 8, r.left + r.width / 2 - tr.width / 2));
    tb.style.top = Math.max(topLimit, top) + 'px'; tb.style.left = left + 'px';
  }

  function tbBtn(ic, title, onclick, opts = {}) {
    const b = h('button', { class: 'tb' + (opts.on ? ' on' : '') + (opts.danger ? ' danger' : ''), title, type: 'button' });
    if (ic) b.append(icon(ic));
    if (opts.label) b.append(document.createTextNode(opts.label));
    b.addEventListener('pointerdown', (e) => e.preventDefault()); // no robar el foco al texto
    b.onclick = onclick; return b;
  }
  const tbSep = () => h('span', { class: 'tb-sep' });

  function buildToolbar(tb, el) {
    tb.textContent = '';
    const id = el.id, st = el.style || {};
    if (el.kind === 'text') {
      const color = h('input', { type: 'color', class: 'tb-color', title: 'Color del texto', value: /^#[0-9a-f]{6}$/i.test(st.color) ? st.color : '#ffffff' });
      color.addEventListener('input', () => { const e2 = getEl(id); e2.style = { ...e2.style, color: color.value }; updateNode(nodes.get(id), e2); queue(id, { style: { color: color.value } }); });
      tb.append(color);
      for (const [bg, name] of TEXT_BG) {
        const sw = h('button', { class: 'sw' + (bg === 'transparent' ? ' none' : '') + ((st.bg || 'transparent') === bg ? ' on' : ''), title: 'Fondo: ' + name, type: 'button' });
        if (bg !== 'transparent') sw.style.background = bg;
        sw.addEventListener('pointerdown', (e) => e.preventDefault());
        sw.onclick = () => {
          const patch = { bg };
          if (bg.startsWith('rgba(255') || bg === '#ffb84d') patch.color = '#15171b';
          else if (bg !== 'transparent' && (st.color || '').toLowerCase() === '#15171b') patch.color = '#ffffff';
          update(id, { style: { ...getEl(id).style, ...patch } });
        };
        tb.append(sw);
      }
      tb.append(tbSep());
      const step = (d) => { const s = Math.max(10, Math.min(400, (getEl(id).style.size || 48) + d)); update(id, { style: { ...getEl(id).style, size: s } }); };
      tb.append(tbBtn('minus', 'Más pequeño', () => step(-6)), h('span', { class: 'tb-size', text: String(Math.round(st.size || 48)) }), tbBtn('plus', 'Más grande', () => step(6)));
      tb.append(tbBtn('bold', 'Negrita', () => update(id, { style: { ...st, bold: !st.bold } }), { on: st.bold }));
      const nextAlign = { left: 'center', center: 'right', right: 'left' }[st.align || 'center'];
      tb.append(tbBtn({ left: 'alignL', center: 'alignC', right: 'alignR' }[st.align || 'center'], 'Alineación', () => update(id, { style: { ...st, align: nextAlign } })));
      const font = h('select', { class: 'tb-select', title: 'Tipo de letra' });
      for (const [v, name] of [['sans', 'Moderna'], ['serif', 'Clásica'], ['mono', 'Máquina'], ['hand', 'A mano']]) font.append(h('option', { value: v, text: name, selected: (st.font || 'sans') === v }));
      font.onchange = () => update(id, { style: { ...getEl(id).style, font: font.value } });
      tb.append(font, tbSep(), tbBtn('edit', 'Cambiar el texto (doble clic o Intro)', () => startEditing(id), { label: 'Editar' }));
      if (el.parent) tb.append(tbBtn('unlink', 'Soltar de la foto (dejará de moverse con ella)', () => reparent(getEl(id), true), { label: 'Soltar' }));
    } else {
      tb.append(
        tbBtn('minus', 'Foto más pequeña', () => zoomEl(getEl(id), 1 / 1.2)),
        tbBtn('plus', 'Foto más grande', () => zoomEl(getEl(id), 1.2)),
        tbBtn(prevGeom.has(id) ? 'shrink' : 'expand', prevGeom.has(id) ? 'Volver al tamaño anterior' : 'Ampliar a toda la pantalla', () => toggleMax(getEl(id)), { label: prevGeom.has(id) ? 'Reducir' : 'Ampliar', on: prevGeom.has(id) }),
        tbSep());
      if (el.kind === 'image') tb.append(tbBtn('edit', 'Editar foto', () => openEditor(id), { label: 'Editar' }));
      tb.append(tbBtn('focus', 'Acercar el muro a esta foto (también en /pantalla)', () => focusOn(getEl(id)), { label: 'Enfocar' }));
      if (isMedia(el)) tb.append(tbBtn('view', 'Ver en grande', () => openLightbox(id)));
      if (el.kind === 'video' || el.kind === 'audio') {
        tb.append(tbBtn(el.playing ? 'pause' : 'play', el.playing ? 'Pausar' : 'Reproducir', () => update(id, { playing: !el.playing })));
        const muted = el.muted ?? (el.kind === 'video');
        tb.append(tbBtn(muted ? 'mute' : 'sound', muted ? 'Activar sonido' : 'Silenciar', () => update(id, { muted: !muted })));
      }
      if (el.kind === 'pdf' || el.kind === 'doc') tb.append(tbBtn('open', 'Abrir archivo', () => window.open(el.file.url, '_blank', 'noopener'), { label: 'Abrir' }));
      if (el.author || el.message) tb.append(tbBtn('caption', 'Mostrar nombre y mensaje', () => update(id, { showCaption: !el.showCaption }), { on: el.showCaption }));
      tb.append(tbBtn('text', 'Añadir texto encima (se moverá con la foto)', () => $('#addText').click(), { label: 'Texto' }));
    }
    tb.append(tbSep(),
      tbBtn('front', 'Traer al frente', () => socket.emit('front', id)),
      tbBtn('back', 'Enviar al fondo', () => socket.emit('back', id)),
      tbBtn(el.hidden ? 'eyeoff' : 'eye', el.hidden ? 'Oculto en pantalla: mostrar' : 'Ocultar de la pantalla', () => update(id, { hidden: !el.hidden }), { on: el.hidden }),
      tbBtn('trash', 'Eliminar (Supr)', () => removeEl(id), { danger: true, label: el.kind === 'text' ? 'Eliminar' : '' }));
  }

  // ---------- Lista lateral ----------
  let sideTab = 'all', sideSig = null;
  document.querySelectorAll('.tab').forEach((t) => { t.onclick = () => { sideTab = t.dataset.tab; sideSig = null; renderSide(); }; });
  $('#approveAll').onclick = () => {
    for (const e of state.elements) if (e.status === 'pending') { e.status = 'live'; queue(e.id, { status: 'live' }); }
    flush(); render();
  };
  function renderSide() {
    const files = state.elements.filter((e) => e.kind !== 'text');
    const pend = files.filter((e) => e.status === 'pending');
    $('#cntAll').textContent = files.filter((e) => e.status === 'live').length;
    $('#cntPending').textContent = pend.length;
    document.querySelector('.tab[data-tab="pending"]').classList.toggle('alert', pend.length > 0);
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === sideTab));
    $('#pendingActions').hidden = !(sideTab === 'pending' && pend.length > 1);
    const items = (sideTab === 'pending' ? pend : files.filter((e) => e.status === 'live')).slice().sort((a, b) => b.createdAt - a.createdAt);
    const sig = sideTab + '|' + selectedId + '|' + items.map((e) => [e.id, e.hidden, e.file.url].join(',')).join(';');
    if (sig === sideSig) return; sideSig = sig;
    const list = $('#list'); list.textContent = '';
    if (!items.length) {
      list.append(h('div', { class: 'empty-list', text: sideTab === 'pending' ? 'Nada pendiente de revisar.' : 'Aún no ha llegado nada. Comparte el QR.' }));
      return;
    }
    for (const el of items) {
      const th = h('div', { class: 'th' });
      if (el.kind === 'image') th.style.backgroundImage = `url("${el.file.url}")`;
      else th.innerHTML = ICON[el.kind] || ICON.doc;
      const acts = h('div', { class: 'acts' });
      const sb = (label, cls, fn) => { const b = h('button', { class: 'sbtn ' + cls, text: label, type: 'button' }); b.onclick = (ev) => { ev.stopPropagation(); fn(); }; return b; };
      if (el.status === 'pending') {
        acts.append(sb('Aprobar', 'ok', () => update(el.id, { status: 'live' })));
        if (isMedia(el)) acts.append(sb('Ver', '', () => openLightbox(el.id, true)));
        acts.append(sb('Descartar', 'del', () => removeEl(el.id)));
      } else {
        if (isMedia(el)) acts.append(sb('Ver', '', () => openLightbox(el.id)));
        if (el.kind === 'image') acts.append(sb('Editar', '', () => openEditor(el.id)));
        acts.append(sb(el.hidden ? 'Mostrar' : 'Ocultar', '', () => update(el.id, { hidden: !el.hidden })));
        acts.append(sb('Eliminar', 'del', () => removeEl(el.id)));
      }
      const item = h('div', { class: 'item' + (el.id === selectedId ? ' is-sel' : '') + (el.hidden ? ' hid' : '') },
        th,
        h('div', { class: 'info' },
          h('div', { class: 'who', text: el.author || 'Anónimo' }),
          h('div', { class: 'meta', text: fmtTime(el.createdAt) + ' · ' + el.file.name }),
          el.message ? h('div', { class: 'msg', text: el.message }) : null),
        acts);
      item.onclick = () => { if (el.status === 'live') { select(el.id); socket.emit('front', el.id); } };
      list.append(item);
    }
  }

  // ---------- Visor ----------
  // Al abrir el visor, la foto sale también a pantalla completa en /pantalla (se puede desactivar)
  const LB = { list: [], i: 0, project: false, pref: true };
  function openLightbox(id, includePending) {
    LB.list = state.elements.filter((e) => isMedia(e) && (e.status === 'live' || (includePending && e.id === id)))
      .sort((a, b) => a.createdAt - b.createdAt).map((e) => e.id);
    LB.i = Math.max(0, LB.list.indexOf(id));
    const first = getEl(LB.list[LB.i]);
    LB.project = LB.pref && Boolean(first && first.status === 'live');
    if (LB.project) toast('Esta foto se ve ahora a pantalla completa en /pantalla');
    $('#lightbox').hidden = false; $('#toolbar').hidden = true; showLightbox();
  }
  function showLightbox() {
    const el = getEl(LB.list[LB.i]); if (!el) return closeLightbox();
    const box = $('#lbMedia'); box.textContent = '';
    if (el.kind === 'image') box.append(h('img', { src: el.file.url, alt: '' }));
    else { const v = h('video', { src: el.file.url, controls: true, playsinline: true, autoplay: true }); box.append(v); }
    $('#lbCap').textContent = [el.message, el.author ? '— ' + el.author : ''].filter(Boolean).join('  ') || el.file.name;
    $('#lbCount').textContent = `${LB.i + 1} / ${LB.list.length}`;
    $('#lbEdit').hidden = el.kind !== 'image';
    $('#lbProject').hidden = el.status !== 'live';
    $('#lbProject').classList.toggle('on', LB.project);
    $('#lbProject').lastChild.textContent = LB.project ? 'En /pantalla' : 'Mostrar en /pantalla';
    $('#lbPrev').hidden = $('#lbNext').hidden = LB.list.length < 2;
    if (LB.project) setting({ spotlight: el.id });
  }
  function stepLightbox(d) { if (LB.list.length < 2) return; LB.i = (LB.i + d + LB.list.length) % LB.list.length; showLightbox(); }
  function closeLightbox() {
    $('#lightbox').hidden = true; const v = $('#lbMedia video'); if (v) v.pause(); $('#lbMedia').textContent = '';
    if (LB.project) { LB.project = false; setting({ spotlight: '' }); }
    renderTopbar(); renderToolbar();
  }
  $('#lbClose').onclick = closeLightbox;
  $('#lbPrev').onclick = () => stepLightbox(-1);
  $('#lbNext').onclick = () => stepLightbox(1);
  $('#lightbox').addEventListener('click', (e) => { if (e.target.id === 'lightbox') closeLightbox(); });
  $('#lbProject').onclick = () => {
    LB.project = !LB.project; LB.pref = LB.project; // recuerda la elección para las próximas veces
    $('#lbProject').classList.toggle('on', LB.project);
    $('#lbProject').lastChild.textContent = LB.project ? 'En /pantalla' : 'Mostrar en /pantalla';
    setting({ spotlight: LB.project ? LB.list[LB.i] : '' });
    toast(LB.project ? 'Se ve en grande en /pantalla' : 'Quitado de /pantalla');
  };
  $('#lbEdit').onclick = () => { const id = LB.list[LB.i]; closeLightbox(); openEditor(id); };

  // ---------- Editor de fotos ----------
  const FILTER_OK = (() => { try { const c = document.createElement('canvas').getContext('2d'); return Boolean(c) && 'filter' in c; } catch { return false; } })();
  const DEF = { bright: 100, contrast: 100, sat: 100, gray: 0, sepia: 0, hue: 0, blur: 0, warm: 0, rot: 0, flip: false };
  const SLIDERS = [['bright', 'Brillo', 0, 200, '%'], ['contrast', 'Contraste', 0, 200, '%'], ['sat', 'Saturación', 0, 200, '%'], ['warm', 'Calidez', -100, 100, ''], ['gray', 'Blanco y negro', 0, 100, '%'], ['sepia', 'Sepia', 0, 100, '%'], ['hue', 'Tono', -180, 180, '°'], ['blur', 'Desenfoque', 0, 10, '']];
  const PRESETS = [
    ['Original', {}], ['B/N', { gray: 100, contrast: 115 }], ['Vívido', { sat: 150, contrast: 115 }],
    ['Cálido', { warm: 45, sat: 110 }], ['Frío', { warm: -45 }], ['Vintage', { sepia: 45, contrast: 90, bright: 105, sat: 80 }],
  ];
  const ED = { el: null, img: null, p: { ...DEF }, crop: null, cropMode: false, ratio: 0, base: null, baseKey: null, ds: 1, drag: null };

  function filterStr(p, blurScale) {
    let f = `brightness(${p.bright}%) contrast(${p.contrast}%) saturate(${p.sat}%) grayscale(${p.gray}%) sepia(${p.sepia}%) hue-rotate(${p.hue}deg)`;
    if (p.blur > 0) f += ` blur(${(p.blur * blurScale).toFixed(2)}px)`;
    return f;
  }
  // Calidez: un velo naranja o azul en modo «luz suave» (funciona también sin ctx.filter)
  function applyWarm(x, w, hh, warm) {
    if (!warm) return;
    x.save();
    x.globalCompositeOperation = 'soft-light';
    x.fillStyle = warm > 0 ? `rgba(255,138,0,${warm / 100 * 0.6})` : `rgba(0,110,255,${-warm / 100 * 0.6})`;
    x.fillRect(0, 0, w, hh);
    x.restore();
  }

  function baseCanvas(img, p, maxDim) {
    const s = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const iw = Math.round(img.naturalWidth * s), ih = Math.round(img.naturalHeight * s);
    const swap = p.rot % 180 !== 0;
    const c = document.createElement('canvas'); c.width = swap ? ih : iw; c.height = swap ? iw : ih;
    const x = c.getContext('2d');
    x.translate(c.width / 2, c.height / 2); x.rotate(p.rot * Math.PI / 180); if (p.flip) x.scale(-1, 1);
    x.drawImage(img, -iw / 2, -ih / 2, iw, ih);
    return c;
  }

  function buildEditorControls() {
    const box = $('#edSliders'); box.textContent = '';
    box.append(h('div', { class: 'ed-label', text: 'Ajustes' }));
    for (const [k, label, min, max, unit] of SLIDERS) {
      const out = h('output', { text: ED.p[k] + unit });
      const inp = h('input', { type: 'range', min, max, step: 1, value: ED.p[k], disabled: !FILTER_OK && k !== 'warm', 'aria-label': label });
      inp.oninput = () => { ED.p[k] = Number(inp.value); out.textContent = inp.value + unit; drawPreview(); };
      inp.ondblclick = () => { ED.p[k] = DEF[k]; inp.value = DEF[k]; out.textContent = DEF[k] + unit; drawPreview(); };
      box.append(h('div', { class: 'ed-slider' }, h('label', { text: label }), out, inp));
    }
    $('#edNote').hidden = FILTER_OK;
    const pr = $('#edPresets'); pr.textContent = '';
    for (const [name, vals] of PRESETS) {
      const b = h('button', { type: 'button', text: name, disabled: !FILTER_OK && name !== 'Original' });
      b.onclick = () => { ED.p = { ...DEF, ...vals, rot: ED.p.rot, flip: ED.p.flip }; buildEditorControls(); drawPreview(); };
      pr.append(b);
    }
  }

  async function openEditor(id) {
    const el = getEl(id); if (!el || el.kind !== 'image') return;
    if (/svg|gif/.test(el.file.mime)) return toast('Este formato no se puede editar (solo JPG, PNG o WebP)');
    ED.el = el; ED.p = { ...DEF }; ED.crop = null; ED.cropMode = false; ED.baseKey = null;
    $('#edCrop').classList.remove('on'); $('#edCanvas').classList.remove('cropping');
    $('#edOriginal').hidden = el.file.url === el.file.originalUrl;
    $('#editor').hidden = false; $('#toolbar').hidden = true;
    buildEditorControls();
    try {
      ED.img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = el.file.url; });
      drawPreview();
    } catch { toast('No se pudo cargar la foto'); closeEditor(); }
  }
  function closeEditor() { $('#editor').hidden = true; ED.el = ED.img = ED.base = null; renderToolbar(); }

  function drawPreview() {
    if (!ED.img) return;
    const key = ED.p.rot + '|' + ED.p.flip;
    if (ED.baseKey !== key) { ED.base = baseCanvas(ED.img, ED.p, 1800); ED.baseKey = key; }
    const base = ED.base, stage = $('#edStage');
    const aw = stage.clientWidth - 40, ah = stage.clientHeight - 40;
    const ds = Math.min(1, aw / base.width, ah / base.height); ED.ds = ds;
    const cv = $('#edCanvas'); const w = Math.max(1, Math.round(base.width * ds)), hh = Math.max(1, Math.round(base.height * ds));
    if (cv.width !== w || cv.height !== hh) { cv.width = w; cv.height = hh; }
    const x = cv.getContext('2d');
    x.clearRect(0, 0, w, hh);
    if (FILTER_OK) x.filter = filterStr(ED.p, w / 1000);
    x.drawImage(base, 0, 0, w, hh);
    if (FILTER_OK) x.filter = 'none';
    applyWarm(x, w, hh, ED.p.warm);
    const c = ED.crop;
    if (c) {
      const cx = c.x * w, cy = c.y * hh, cw = c.w * w, ch = c.h * hh;
      x.fillStyle = 'rgba(0,0,0,.6)';
      x.fillRect(0, 0, w, cy); x.fillRect(0, cy + ch, w, hh - cy - ch); x.fillRect(0, cy, cx, ch); x.fillRect(cx + cw, cy, w - cx - cw, ch);
      x.strokeStyle = '#ffb84d'; x.lineWidth = 2; x.strokeRect(cx + 1, cy + 1, cw - 2, ch - 2);
      if (ED.cropMode) {
        x.strokeStyle = 'rgba(255,255,255,.45)'; x.lineWidth = 1; x.beginPath();
        for (let k = 1; k < 3; k++) { x.moveTo(cx + cw * k / 3, cy); x.lineTo(cx + cw * k / 3, cy + ch); x.moveTo(cx, cy + ch * k / 3); x.lineTo(cx + cw, cy + ch * k / 3); }
        x.stroke();
      }
    }
  }
  new ResizeObserver(() => { if (!$('#editor').hidden) drawPreview(); }).observe($('#edStage'));

  const edPt = (e) => { const r = $('#edCanvas').getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }; };
  $('#edCanvas').addEventListener('pointerdown', (e) => {
    if (!ED.cropMode) return;
    const p = edPt(e), c = ED.crop;
    if (c && p.x > c.x && p.x < c.x + c.w && p.y > c.y && p.y < c.y + c.h) ED.drag = { type: 'move', start: p, orig: { ...c } };
    else ED.drag = { type: 'new', start: p };
    e.target.setPointerCapture(e.pointerId);
  });
  $('#edCanvas').addEventListener('pointermove', (e) => {
    if (!ED.drag) return;
    const p = edPt(e), d = ED.drag;
    if (d.type === 'move') {
      const o = d.orig;
      ED.crop = { ...o, x: Math.min(1 - o.w, Math.max(0, o.x + p.x - d.start.x)), y: Math.min(1 - o.h, Math.max(0, o.y + p.y - d.start.y)) };
    } else {
      let w = p.x - d.start.x, hh = p.y - d.start.y;
      if (ED.ratio) {
        const bw = ED.base.width, bh = ED.base.height;
        hh = Math.sign(hh || 1) * Math.abs(w) * bw / (ED.ratio * bh);
        // Ajusta si se sale por arriba o por abajo
        const maxH = hh > 0 ? 1 - d.start.y : d.start.y;
        if (Math.abs(hh) > maxH) { hh = Math.sign(hh) * maxH; w = Math.sign(w || 1) * Math.abs(hh) * ED.ratio * bh / bw; }
      }
      const x = Math.max(0, Math.min(d.start.x, d.start.x + w)), y = Math.max(0, Math.min(d.start.y, d.start.y + hh));
      ED.crop = { x, y, w: Math.min(1 - x, Math.abs(w)), h: Math.min(1 - y, Math.abs(hh)) };
    }
    drawPreview();
  });
  $('#edCanvas').addEventListener('pointerup', () => {
    if (ED.drag && ED.crop && (ED.crop.w < 0.02 || ED.crop.h < 0.02)) ED.crop = null;
    ED.drag = null; drawPreview();
  });

  const rotate = (d) => { ED.p.rot = (ED.p.rot + d + 360) % 360; ED.crop = null; drawPreview(); };
  $('#edRotL').onclick = () => rotate(-90);
  $('#edRotR').onclick = () => rotate(90);
  $('#edFlip').onclick = () => { ED.p.flip = !ED.p.flip; ED.crop = null; drawPreview(); };
  $('#edCrop').onclick = () => { ED.cropMode = !ED.cropMode; $('#edCrop').classList.toggle('on', ED.cropMode); $('#edCanvas').classList.toggle('cropping', ED.cropMode); drawPreview(); };
  $('#edRatio').onchange = (e) => { ED.ratio = Number(e.target.value); if (!ED.cropMode) $('#edCrop').click(); };
  $('#edCropClear').onclick = () => { ED.crop = null; drawPreview(); };
  $('#edReset').onclick = () => { ED.p = { ...DEF }; ED.crop = null; buildEditorControls(); drawPreview(); };
  $('#edCancel').onclick = closeEditor;
  $('#edOriginal').onclick = () => {
    if (!confirm('¿Volver a la foto original y descartar las ediciones guardadas?')) return;
    socket.emit('restore-original', ED.el.id); closeEditor(); toast('Foto original restaurada');
  };
  $('#edSave').onclick = async () => {
    if (!ED.img) return;
    const btn = $('#edSave'); btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      const base = baseCanvas(ED.img, ED.p, 4096);
      const c = ED.crop || { x: 0, y: 0, w: 1, h: 1 };
      const sx = Math.round(c.x * base.width), sy = Math.round(c.y * base.height);
      const sw = Math.max(1, Math.round(c.w * base.width)), sh = Math.max(1, Math.round(c.h * base.height));
      const out = document.createElement('canvas'); out.width = sw; out.height = sh;
      const x = out.getContext('2d');
      if (FILTER_OK) x.filter = filterStr(ED.p, base.width / 1000);
      x.drawImage(base, sx, sy, sw, sh, 0, 0, sw, sh);
      x.filter = 'none';
      applyWarm(x, sw, sh, ED.p.warm);
      const type = ED.el.file.mime === 'image/png' ? 'image/png' : 'image/jpeg';
      const blob = await new Promise((r) => out.toBlob(r, type, 0.92));
      const fd = new FormData();
      fd.append('image', blob, 'editada' + (type === 'image/png' ? '.png' : '.jpg'));
      fd.append('w', sw); fd.append('h', sh);
      const res = await fetch('/api/edit/' + ED.el.id, { method: 'POST', headers: { 'x-admin-pin': pin }, body: fd });
      if (!res.ok) throw new Error();
      closeEditor(); toast('Foto guardada');
    } catch { toast('No se pudo guardar la foto'); }
    btn.disabled = false; btn.textContent = 'Guardar';
  };

  // ---------- Arranque ----------
  // En el móvil en vertical el muro (horizontal) se ve pequeño: sugerimos girarlo una vez
  let rotHinted = false;
  const rotHint = () => {
    if (rotHinted || !isNarrow() || innerWidth >= innerHeight) return;
    rotHinted = true; setTimeout(() => toast('Gira el móvil para ver el muro más grande'), 1200);
  };
  window.addEventListener('resize', rotHint); rotHint();
  try { pin = sessionStorage.getItem('pv-pin'); } catch {}
  if (pin) connect(); else showLogin();
  fit();
})();
