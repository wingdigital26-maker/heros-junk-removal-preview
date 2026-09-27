/*
 * Hero's travelling cube piece (piece5).
 *
 * ONE full-viewport WebGL canvas (fixed, pointer-events none, one renderer) carrying ~420 satin cubes that
 * travel between the dock stations placed in the page:
 *
 *   <span class="dock" data-form="pin|truck|couch|star|camera|house|h|box" data-size="S|M|L" aria-hidden="true"></span>
 *
 * (legacy <span class="lp-dock" data-form=".."> spots are honoured too). The piece never lives in the header.
 *
 * Motion model: the docks are sorted in scroll order and the scroll position becomes one continuous number
 * G = segment + progress. The cluster rides the scroll from dock to dock on a critically damped spring (page
 * space, so it sits dead still in a dock while you scroll and carries its velocity between docks). Every cube is
 * its own critically damped spring: cubes switch from the old form's slot to the new form's slot one by one
 * (staggered along the travel direction), drift on a divergence-free (ABC) curl field while in flight, and settle
 * without snapping. Cube matching between consecutive docks is precomputed in Blender (nearest cube, colour kept).
 * If a flight would cross text or buttons, or the docks are far apart, the cluster thins into a small stream of
 * cubes in the right page gutter and re-forms at the next dock. Before the first / after the last dock it rests
 * in the nearest dock. Idle life never stops: breathing, sway, a ripple every few seconds, a soft contact shadow,
 * hover makes the cubes scatter and re-pop.
 *
 * Reduced motion / no WebGL / a failed boot: every dock gets a static Blender render (still-<form>[-dark].png).
 * Data: shapes.json + stills from brand/logo4/build.py (Blender). three.js loads after the page has loaded.
 */
const HERE = (p) => new URL(p, import.meta.url).href;
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';
const root = document.documentElement;
const DOCK_SEL = '.dock[data-form], .lp-dock[data-form]';
const KNOWN = ['house', 'pin', 'truck', 'couch', 'star', 'camera', 'h', 'box'];
const ALIAS = { logo: 'house', logo_rev: 'house', home: 'house', letter: 'h' };
const OBST_SEL = 'h1,h2,h3,h4,h5,h6,p,li,dt,dd,blockquote,figcaption,label,a,button,input,select,textarea,[role=button],summary';

const formOf = (el) => { const f = (el.dataset.form || '').toLowerCase(); return ALIAS[f] || f; };

function isDark(el) {
  if (el.dataset.form === 'logo_rev' || el.dataset.tone === 'dark') return true;
  if (el.dataset.tone === 'light') return false;
  for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
    const m = getComputedStyle(n).backgroundColor.match(/[\d.]+/g);
    if (m && (m.length < 4 || +m[3] > 0.5)) {
      const l = (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255;
      return l < 0.4;
    }
  }
  return false;
}

function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) { return false; }
}

// static Blender renders in every dock (reduced motion, no WebGL, failed boot)
function stills() {
  document.querySelectorAll(DOCK_SEL).forEach((el) => {
    const f = formOf(el);
    if (!KNOWN.includes(f) || el.querySelector('img.dock-still')) return;
    const img = new Image();
    img.className = 'dock-still'; img.alt = ''; img.decoding = 'async'; img.loading = 'lazy';
    img.src = HERE(`still-${f}${isDark(el) ? '-dark' : ''}.png`);
    el.appendChild(img);
  });
  root.classList.add('dock-static');
  root.classList.remove('lp-live');
}

const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (document.querySelector(DOCK_SEL)) {
  if (reduced || !webglOK()) {
    stills();
  } else {
    const go = () => boot().catch((e) => {
      document.querySelectorAll('canvas.lp-canvas').forEach((c) => c.remove());
      stills();
      console.warn('[piece]', e);
    });
    const idle = () => (window.requestIdleCallback ? requestIdleCallback(go, { timeout: 1500 }) : setTimeout(go, 200));
    if (document.readyState === 'complete') idle(); else window.addEventListener('load', idle, { once: true });
  }
}

// ------------------------------------------------------------------ helpers
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (t) => t * t * (3 - 2 * t);
const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const TAU = Math.PI * 2;

function roundedCube(THREE, size, radius, seg) {
  const g = new THREE.BoxGeometry(size, size, size, seg, seg, seg);
  const pos = g.attributes.position, nor = g.attributes.normal;
  const h = size / 2 - radius, v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    c.set(Math.max(-h, Math.min(h, v.x)), Math.max(-h, Math.min(h, v.y)), Math.max(-h, Math.min(h, v.z)));
    v.sub(c);
    const len = v.length() || 1;
    v.multiplyScalar(1 / len);
    nor.setXYZ(i, v.x, v.y, v.z);
    pos.setXYZ(i, c.x + v.x * radius, c.y + v.y * radius, c.z + v.z * radius);
  }
  return g;
}

function studioEnv(THREE, renderer) {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial({ color: 0x5b5f66, side: THREE.BackSide })));
  const card = (c, x, y, z, w, h, ry, rx) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.rotation.set(rx || 0, ry || 0, 0); s.add(m);
  };
  card(0xffffff, 0, 4.9, 0, 6, 6, 0, Math.PI / 2);
  card(0xfff1e0, -4.9, 1, 1, 3, 5, Math.PI / 2);
  card(0xdfe8ff, 4.9, 0, 2, 2, 4, -Math.PI / 2);
  card(0xffffff, 0, 1.5, 4.9, 5, 2, 0);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(s, 0.04).texture;
  pm.dispose();
  return tex;
}

function shadowTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 32;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 16, 0, 64, 16, 64);
  grd.addColorStop(0, 'rgba(20,40,75,0.55)');
  grd.addColorStop(0.45, 'rgba(20,40,75,0.22)');
  grd.addColorStop(1, 'rgba(20,40,75,0)');
  g.setTransform(1, 0, 0, 0.25, 0, 12);
  g.fillStyle = grd; g.fillRect(0, -64, 128, 192);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ boot
async function boot() {
  const [THREE, data] = await Promise.all([
    import(THREE_URL),
    fetch(HERE('shapes.json?v=5')).then((r) => { if (!r.ok) throw new Error('shapes ' + r.status); return r.json(); }),
  ]);
  const N = data.n;
  const P = {}, DIM = {}, COLL = {}, COLD = {};
  const tc = new THREE.Color();
  const DARK = {};
  for (const k in data.dark) DARK[parseInt(k, 16)] = data.dark[k];
  for (const f of KNOWN) {
    if (!data.forms[f]) continue;
    P[f] = Float32Array.from(data.forms[f]);
    DIM[f] = data.dims[f];
    const a = new Float32Array(N * 3), b = new Float32Array(N * 3);
    for (let k = 0; k < N; k++) {
      const hx = data.colors[f][k];
      tc.setHex(hx); a[k * 3] = tc.r; a[k * 3 + 1] = tc.g; a[k * 3 + 2] = tc.b;
      tc.setHex(DARK[hx] !== undefined ? DARK[hx] : hx); b[k * 3] = tc.r; b[k * 3 + 1] = tc.g; b[k * 3 + 2] = tc.b;
    }
    COLL[f] = a; COLD[f] = b;
  }
  const permCache = {};
  function perm(a, b) {
    const key = a + '|' + b;
    if (permCache[key]) return permCache[key];
    let p;
    if (data.perms[key]) p = Int32Array.from(data.perms[key]);
    else {
      const q = data.perms[b + '|' + a];
      p = new Int32Array(N);
      for (let i = 0; i < N; i++) p[q[i]] = i;
    }
    return (permCache[key] = p);
  }

  // ---- canvas + renderer (one, full viewport)
  const canvas = document.createElement('canvas');
  canvas.className = 'lp-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;

  const scene = new THREE.Scene();
  scene.environment = studioEnv(THREE, renderer);
  scene.environmentIntensity = 0.75;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa3b5, 0.85));
  const key = new THREE.DirectionalLight(0xfff6ea, 2.0); key.position.set(-0.5, 0.9, 1); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffe2c8, 1.25); rim.position.set(1, 0.75, -0.15); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.35); fill.position.set(0.8, -0.4, 0.8); scene.add(fill);

  const camera = new THREE.OrthographicCamera(0, 1, 0, -1, 1, 20000);
  camera.position.set(0, 0, 10000);
  const pivot = new THREE.Group();
  scene.add(pivot);

  const FILL = data.fill || 0.86;
  const geo = roundedCube(THREE, FILL, FILL * (data.bevel || 0.22), 3);
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.5, metalness: 0, clearcoat: 0.2, clearcoatRoughness: 0.35,
    sheen: 0.4, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xffffff),
  });
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  pivot.add(mesh);

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: shadowTexture(THREE), transparent: true, depthWrite: false, depthTest: false, opacity: 0 }));
  shadow.renderOrder = -1;
  shadow.position.z = -5000;
  scene.add(shadow);

  let VW = 0, VH = 0, phone = false;
  function resize() {
    VW = document.documentElement.clientWidth; VH = window.innerHeight;
    phone = VW < 760;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(VW, VH, false);
    camera.left = 0; camera.right = VW; camera.top = 0; camera.bottom = -VH;
    camera.updateProjectionMatrix();
  }

  // ---- per-cube randoms
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const R1 = new Float32Array(N), R2 = new Float32Array(N), PH = new Float32Array(N), AX = new Float32Array(N * 3), W = new Float32Array(N);
  const RANK = new Float32Array(N);
  for (let k = 0; k < N; k++) {
    R1[k] = rnd(); R2[k] = rnd(); PH[k] = rnd() * TAU;
    const a = rnd() * TAU, b = Math.acos(2 * rnd() - 1);
    AX[k * 3] = Math.sin(b) * Math.cos(a); AX[k * 3 + 1] = Math.sin(b) * Math.sin(a); AX[k * 3 + 2] = Math.cos(b);
    W[k] = 7.5 + 4.5 * R2[k];                       // each cube its own spring stiffness (natural stagger)
    RANK[k] = rnd();                                  // place in the gutter stream
  }

  // ---- docks: sorted by page position, each with its own copy of its form in instance order
  let docks = [];
  let obst = new Float32Array(0), nObst = 0;
  function layout() {
    resize();
    const sy = window.scrollY, list = [];
    document.querySelectorAll(DOCK_SEL).forEach((el) => {
      const f = formOf(el);
      if (!P[f]) return;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return;       // hidden at this breakpoint
      const d = DIM[f];
      const k = Math.min(r.width / (d[0] + 1), r.height / (d[1] + 1.8));
      let stk = null, stkTop = 0;                     // nearest sticky ancestor: the dock is pinned while it is stuck
      for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.position === 'sticky') { stk = e; stkTop = parseFloat(cs.top) || 0; break; }
      }
      list.push({ el, form: f, dark: isDark(el), x: 0, y: 0, ox: 0, oy: 0, k, pos: null, col: null, stk, stkTop });
      place(list[list.length - 1], sy);
    });
    list.sort((a, b) => a.y - b.y || a.x - b.x);
    let slot = new Int32Array(N);
    for (let k = 0; k < N; k++) slot[k] = k;
    for (let i = 0; i < list.length; i++) {
      const D = list[i];
      if (i > 0 && list[i - 1].form !== D.form) {
        const p = perm(list[i - 1].form, D.form), nx = new Int32Array(N);
        for (let k = 0; k < N; k++) nx[k] = p[slot[k]];
        slot = nx;
      }
      const src = P[D.form], cs = D.dark ? COLD[D.form] : COLL[D.form];
      D.pos = new Float32Array(N * 3); D.col = new Float32Array(N * 3);
      for (let k = 0; k < N; k++) {
        const s = slot[k] * 3;
        D.pos[k * 3] = src[s]; D.pos[k * 3 + 1] = src[s + 1]; D.pos[k * 3 + 2] = src[s + 2];
        D.col[k * 3] = cs[s]; D.col[k * 3 + 1] = cs[s + 1]; D.col[k * 3 + 2] = cs[s + 2];
      }
    }
    docks = list;
    // things a flight must never cross: text, links, buttons, fields (page coords)
    const els = document.querySelectorAll(OBST_SEL), rects = [];
    const hdr = document.querySelector("header");
    for (let i = 0; i < els.length && rects.length < 3200; i++) {
      const e = els[i];
      if ((hdr && hdr.contains(e)) || e.closest('.t-rail,[data-fixed]')) continue;
      const r = e.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      rects.push(r.left, r.top + sy, r.right, r.bottom + sy);
    }
    obst = Float32Array.from(rects); nObst = rects.length / 4;
    segI = -1;
  }
  function place(D, sy) {                           // live: docks inside sticky columns move with the page
    const r = D.el.getBoundingClientRect();
    D.ox = D.x; D.oy = D.y;                          // where it was last frame (sticky docks travel with the scroll)
    D.x = r.left + r.width / 2; D.y = r.top + sy + r.height / 2 - D.k * 0.35;
  }
  // ---- state (all preallocated)
  const X = new Float32Array(N * 3), V = new Float32Array(N * 3), CUR = new Float32Array(N * 3), DELAY = new Float32Array(N);
  let segI = -1;
  let px = 0, py = 0, vx = 0, vy = 0, kS = 1, kV = 0, spin = 0, spinV = 0, st = 0, stV = 0, placed = false;
  let lastG = 0, lastS = 0, dimW = 10, dimH = 10, streamPhase = false, lastX = 0, lastY = 0, lastPk = 1;

  let streamSeg = false;
  function planSegment(A, B) {
    let dx = B.x - A.x, dy = B.y - A.y;
    const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    const d = DIM[A.form], ext = (Math.abs(dx) * (d[0] + 1) + Math.abs(dy) * (d[1] + 1)) / 2 || 1;
    for (let k = 0; k < N; k++) {
      const pr = (A.pos[k * 3] * dx - A.pos[k * 3 + 1] * dy) / ext;       // -1 trailing .. +1 leading side
      DELAY[k] = 0.06 + 0.86 * clamp01(0.6 * (0.5 - pr * 0.5) + 0.4 * R1[k]);
    }
    // a free flight only when the docks are close and the whole path is clear of text / buttons;
    // otherwise the form dissolves in its dock, a thread of cubes flows down the gutter, and it re-forms
    streamSeg = A !== B && Math.abs(B.y - A.y) > 0.95 * VH;
    if (A !== B && !streamSeg) {
      const dB = DIM[B.form];
      for (let i = 1; i < 12 && !streamSeg; i++) {
        const u = i / 12, k = A.k + (B.k - A.k) * u;
        const hw = ((d[0] + (dB[0] - d[0]) * u) / 2 + 0.8) * k + 8, hh = ((d[1] + (dB[1] - d[1]) * u) / 2 + 0.8) * k + 8;
        const cx = A.x + (B.x - A.x) * u, cy = A.y + (B.y - A.y) * u;
        const l = cx - hw, r = cx + hw, t = cy - hh, b = cy + hh;
        for (let o = 0; o < nObst; o++) {
          const j = o * 4;
          if (r > obst[j] && l < obst[j + 2] && b > obst[j + 1] && t < obst[j + 3]) { streamSeg = true; break; }
        }
      }
    }
  }

  // ---- input
  let mx = -1e4, my = -1e4, tiltX = 0, tiltY = 0, spread = 0, spreadV = 0;
  window.addEventListener('pointermove', (e) => { mx = e.clientX; my = e.clientY; }, { passive: true });
  document.addEventListener('pointerleave', () => { mx = my = -1e4; });
  let relayoutT = 0;
  const relayout = () => { clearTimeout(relayoutT); relayoutT = setTimeout(layout, 120); };
  window.addEventListener('resize', relayout, { passive: true });
  if (window.ResizeObserver) new ResizeObserver(relayout).observe(document.body);
  const menu = document.querySelector('.t-mobile-menu');

  // ---- scratch
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s3 = new THREE.Vector3(), ax = new THREE.Vector3();
  const colArr = mesh.instanceColor.array, matArr = mesh.instanceMatrix.array;
  let slow = 1, drawn = true;

  let raf = 0, last = performance.now(), t0 = last;
  function frame(now) {
    raf = 0;
    const dtAll = Math.min(0.05, (now - last) / 1000) / slow;
    last = now;
    const time = (now - t0) / 1000;
    const n = docks.length;
    if (!n) { if (drawn) { renderer.clear(); drawn = false; } loop(); return; }

    // ---- where the scroll says the piece should be: G = segment + eased progress
    const sy = window.scrollY, maxS = Math.max(1, document.documentElement.scrollHeight - VH);
    const endA = clamp01((sy - (maxS - VH * 0.6)) / (VH * 0.6)), topB = clamp01(1 - sy / (VH * 0.6));
    const F = sy + VH * (0.5 + 0.36 * endA - 0.36 * topB);
    for (let j = 0; j < n; j++) place(docks[j], sy);
    let seg = 0, s = 0;
    if (n > 1) {
      let i = -1;
      for (let j = 0; j < n; j++) if (docks[j].y <= F) i = j;
      if (i < 0) { seg = 0; s = 0; } else if (i >= n - 1) { seg = n - 2; s = 1; } else {
        seg = i;
        const gap = Math.max(1, docks[i + 1].y - docks[i].y), u = (F - docks[i].y) / gap;
        const hb = Math.min(0.26, (VH * 0.36) / gap);               // hold in the dock while it is well in view
        s = smoother(clamp01((u - hb) / (1 - 2 * hb)));
      }
    }
    const A = docks[seg], B = docks[Math.min(seg + 1, n - 1)];
    // a dock in a pinned sticky card travels with the scroll: the focus line is always past it, so hold the
    // piece in the card instead of letting it creep down the card's copy toward the next dock
    if (s > 0 && s < 1 && A.stk && Math.abs(A.stk.getBoundingClientRect().top - A.stkTop) < 1.5) s = 0;
    if (seg !== segI) { segI = seg; planSegment(A, B); }
    if (placed) {                                                    // a sticky dock moved since last frame: carry the
      const ddx = (A.x - A.ox) * (1 - s) + (B.x - B.ox) * s;         // piece with it at once so it never drags across
      const ddy = (A.y - A.oy) * (1 - s) + (B.y - B.oy) * s;         // the card's text; the spring only flies real hops
      if (Math.abs(ddx) < VW && Math.abs(ddy) < VH * 3) { px += ddx; py += ddy; }
    }
    lastG = seg + s; lastS = s;

    let tk = A.k + (B.k - A.k) * s;
    let tx = A.x + (B.x - A.x) * s, ty = A.y + (B.y - A.y) * s;
    const dA = DIM[A.form], dB = DIM[B.form];
    dimW = dA[0] + (dB[0] - dA[0]) * s; dimH = dA[1] + (dB[1] - dA[1]) * s;
    const mid = smooth(clamp01(Math.min(s, 1 - s) / 0.13));        // 0 docked .. 1 mid flight
    if (streamSeg) {                                                 // dissolve / re-form in place, never cross content
      const Z = s < 0.5 ? A : B;
      tx = Z.x; ty = Z.y; tk = Z.k;
      const dZ = DIM[Z.form]; dimW = dZ[0]; dimH = dZ[1];
    }
    const stT = streamSeg ? mid : 0;

    // ---- springs (substepped, critically damped)
    const steps = dtAll > 0.021 ? 2 : 1, dt = dtAll / steps;
    for (let sI = 0; sI < steps; sI++) {
      stV += (36 * (stT - st) - 12 * stV) * dt; st += stV * dt;
      if (!placed) { px = tx; py = ty; kS = tk; placed = true; }
      const w = 5.4;                                                // a touch slower between docks
      vx += (w * w * (tx - px) - 2 * w * vx) * dt; px += vx * dt;
      vy += (w * w * (ty - py) - 2 * w * vy) * dt; py += vy * dt;
      kV += (81 * (tk - kS) - 18 * kV) * dt; kS += kV * dt;
      const spT = (streamSeg ? 0 : seg + s) * TAU;
      if (spT - spin > TAU) spin = spT - TAU; else if (spin - spT > TAU) spin = spT + TAU;
      spinV += (30 * (spT - spin) - 11 * spinV) * dt; spin += spinV * dt;
    }
    const stc = clamp01(st);
    // stream phase: the form has dissolved to nothing and a thread of cubes flows down the right gutter
    const inStream = stc >= 0.5;
    if (inStream !== streamPhase) {                                 // swap while every cube is at scale 0
      streamPhase = inStream;
      if (!inStream) {                                              // re-form: start as a loose cloud in the dock
        const T = s > 0.5 ? B.pos : A.pos;
        for (let k = 0; k < N * 3; k++) { X[k] = T[k] * 1.25 + (R1[(k / 3) | 0] - 0.5) * 4; V[k] = 0; }
        px = tx; py = ty; vx = vy = 0; kS = tk; kV = 0;
      }
    }
    const vis = inStream ? smooth((stc - 0.5) / 0.5) : 1 - smooth(stc / 0.5);
    const calm = inStream ? 0 : 1 - stc * 2;

    // ---- hover: cubes scatter and re-pop
    const vxp = inStream ? Math.max(8, Math.min(12, VW * 0.008)) : px;   // left gutter (the right edge holds the section rail)
    const vyp = inStream ? VH * (0.22 + 0.56 * s) : py - sy;
    const reach = Math.max(40, kS * (Math.max(dimW, dimH) * 0.55 + 1));
    const over = !inStream && stc < 0.1 && mid < 0.2 && Math.hypot(mx - vxp, my - vyp) < reach ? 1 : 0;
    spreadV += ((over - spread) * 90 - spreadV * 9) * dtAll;
    spread += spreadV * dtAll;

    // ---- whole piece: sway, breathe, cursor tilt, spin in flight
    tiltX += (clamp01((mx - vxp) / 900 + 0.5) * 2 - 1 - tiltX) * (1 - Math.exp(-dtAll * 3));
    tiltY += (clamp01((my - vyp) / 900 + 0.5) * 2 - 1 - tiltY) * (1 - Math.exp(-dtAll * 3));
    if (mx < -1e3) { tiltX *= 0.98; tiltY *= 0.98; }
    pivot.rotation.set(
      (-0.1 + 0.07 * Math.sin(time * 0.61) + tiltY * 0.22) * calm,
      (0.32 * Math.sin(time * 0.47) + 0.08 * Math.sin(time * 1.13) + tiltX * 0.35) * calm + (inStream ? 0 : spin),
      0.03 * Math.sin(time * 0.37) * calm
    );
    const pk = inStream ? 4.2 : kS;
    const breathe = 1 + 0.02 * Math.sin(time * 1.25) * calm;
    const bob = 2.5 * Math.sin(time * 1.3) * calm;
    pivot.scale.setScalar(pk * breathe);
    pivot.position.set(vxp, -(vyp + bob), 0);

    // contact shadow: only when settled in a dock
    const shO = 0.34 * (1 - mid) * (inStream ? 0 : vis);
    shadow.material.opacity = shO;
    shadow.visible = shO > 0.01;
    shadow.position.x = vxp;
    shadow.position.y = -(vyp + (dimH / 2 + 0.55) * kS);
    shadow.scale.set(dimW * kS * (1.05 - 0.04 * Math.sin(time * 1.3)), Math.max(8, dimW * kS * 0.16), 1);

    // ripple: a diagonal wave pops the cubes forward every ~6 s
    const cyc = time % 6, wv = cyc < 1.6 ? cyc / 1.6 : -1, span = dimW + dimH;

    // ---- cubes
    const PA = A.pos, PB = B.pos, CA = A.col, CB = B.col;
    const cf = 1 - Math.exp(-dtAll * 5);
    const streamH = VH * 0.3 / 4.2, flow = time * 0.07;
    const t1 = time * 0.55, t2 = time * 0.43;
    for (let k = 0; k < N; k++) {
      const j = k * 3;
      const toB = streamSeg ? s > 0.5 : s > DELAY[k];
      const T = toB ? PB : PA, TC = toB ? CB : CA;
      let x, y, z, sc, ang = 0;
      if (inStream) {                                   // kinematic thread, flowing down, tapered ends
        let f = RANK[k] + flow; f -= Math.floor(f);
        const yy = (f - 0.5) * streamH;
        x = (R1[k] - 0.5) * 1.3 + 0.45 * Math.sin(yy * 0.4 - time * 2.2);
        y = -yy; z = (R2[k] - 0.5) * 1.5;
        sc = vis * Math.sin(Math.PI * f) * 0.9;
        ang = time * (R2[k] - 0.5) * 2;
        X[j] = x; X[j + 1] = y; X[j + 2] = z;
      } else {
        let Tx = T[j], Ty = T[j + 1], Tz = T[j + 2];
        if (stc > 0.001) { const g = 1 + stc * 0.9; Tx *= g; Ty *= g; Tz += stc * 5 * (0.5 + R1[k]); }  // dissolve outwards
        const w = W[k];
        for (let sI = 0; sI < steps; sI++) {
          const ex = Tx - X[j], ey = Ty - X[j + 1], ez = Tz - X[j + 2];
          const dist = Math.min(6, Math.abs(ex) + Math.abs(ey) + Math.abs(ez)) + stc * 3;
          // ABC flow (divergence free) so the drifting cubes swirl instead of jitter
          const cx = X[j] * 0.35, cy = X[j + 1] * 0.35, cz = X[j + 2] * 0.35, amp = 5.5 * dist;
          const fx = amp * (Math.sin(cz + t1) + 0.8 * Math.cos(cy - t2));
          const fy = amp * (0.9 * Math.sin(cx - t2) + Math.cos(cz + t1));
          const fz = amp * (0.8 * Math.sin(cy + t1) + 0.9 * Math.cos(cx + t2)) + 9 * dist;
          V[j] += (w * w * ex - 2 * w * V[j] + fx) * dt; X[j] += V[j] * dt;
          V[j + 1] += (w * w * ey - 2 * w * V[j + 1] + fy) * dt; X[j + 1] += V[j + 1] * dt;
          V[j + 2] += (w * w * ez - 2 * w * V[j + 2] + fz) * dt; X[j + 2] += V[j + 2] * dt;
        }
        x = X[j]; y = X[j + 1]; z = X[j + 2];
        const off = Math.min(1, (Math.abs(Tx - x) + Math.abs(Ty - y) + Math.abs(Tz - z)) / 5);
        sc = (1 - 0.28 * off) * vis;
        ang = off * (R2[k] > 0.5 ? 1.7 : -1.7) * (0.5 + R1[k]);
      }
      CUR[j] += (TC[j] - CUR[j]) * cf; CUR[j + 1] += (TC[j + 1] - CUR[j + 1]) * cf; CUR[j + 2] += (TC[j + 2] - CUR[j + 2]) * cf;

      // idle life on top (never written back into the springs)
      if (calm > 0) {
        z += 0.06 * Math.sin(time * 1.7 + PH[k]) * calm;
        if (wv >= 0) {
          const pos = (x - y) / span + 0.5;
          const b = Math.exp(-Math.pow((pos - (wv * 1.6 - 0.3)) * 7, 2)) * calm;
          z += 0.85 * b; sc += 0.1 * b * vis;
        }
      }
      if (spread > 0.001 || spread < -0.001) {
        const l = Math.hypot(x, y) + 0.8, sp = spread * (1.1 + 1.6 * R2[k]);
        x += (x / l) * sp * 1.4; y += (y / l) * sp * 1.4; z += sp * (0.5 + 2.2 * R1[k]);
        ang += spread * (R1[k] - 0.5) * 1.8;
      }
      if (ang !== 0) { ax.set(AX[j], AX[j + 1], AX[j + 2]); q.setFromAxisAngle(ax, ang); } else q.identity();
      v.set(x, y, z); s3.set(sc, sc, sc);
      m4.compose(v, q, s3);
      m4.toArray(matArr, k * 16);
      colArr[j] = CUR[j]; colArr[j + 1] = CUR[j + 1]; colArr[j + 2] = CUR[j + 2];
    }
    lastX = vxp; lastY = vyp; lastPk = pk;

    // draw only while the piece is near the viewport
    const ext = inStream ? VH : (Math.max(dimW, dimH) + 4) * kS;
    const visible = vyp > -ext - 60 && vyp < VH + ext + 60 && !(menu && menu.classList.contains('open'));
    if (visible) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      renderer.render(scene, camera);
      drawn = true;
    } else if (drawn) { renderer.clear(); drawn = false; }
    loop();
  }
  function loop() { if (!raf && !document.hidden) raf = requestAnimationFrame(frame); }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else { last = performance.now(); loop(); }
  });

  layout();
  // start as a loose cloud around the first form so the piece assembles on arrival
  {
    const sy = window.scrollY;
    let best = docks[0], bd = 1e9;
    for (const d of docks) { const e = Math.abs(d.y - sy - VH / 2); if (e < bd) { bd = e; best = d; } }
    if (best) {
      for (let k = 0; k < N * 3; k++) X[k] = best.pos[k] + (rnd() - 0.5) * 14;
      CUR.set(best.col);
    }
  }
  root.classList.add('lp-live');
  loop();

  // test / debug handle
  window.__logoPiece = {
    segs: () => docks.map((d, i) => i),
    state: () => ({ free: !streamSeg, docks: docks.map((d) => d.form), G: +lastG.toFixed(3), s: +lastS.toFixed(3), stream: +st.toFixed(3),
      x: Math.round(lastX), y: Math.round(lastY), k: +lastPk.toFixed(2), phase: streamPhase ? 'stream' : 'form' }),
    slow: (n) => { slow = Math.max(1, Math.min(20, +n || 1)); },
    layout,
  };
}
