/*
 * Hero's piece2: ONE object of 1,600 small cubes, each with a real-world colour and finish per form, that takes itself
 * apart and rebuilds as a house -> truck + trailer -> couch -> the Hero's H,
 * driven by scroll.
 *
 *   import { mount } from './assets/piece2/piece.js';
 *   mount(document.querySelector('#piece'));
 *
 * The host page needs an import map so the three.js example modules resolve
 * to the same pinned build:
 *   <script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js"}}</script>
 *
 * Data: shapes.json (from brand/morph2/build.py). Fallback (reduced motion or
 * no WebGL): the four Blender posters, stacked.
 */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';
import { RoundedBoxGeometry } from 'https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/environments/RoomEnvironment.js';

const FORMS = ['house', 'truck', 'couch', 'h'];
const CAPTIONS = ['Your house', 'Our truck', 'The couch', "Hero's"];
const NAVY = 0x14284b;
const HERE = (p) => new URL(p, import.meta.url).href;

const CSS = `
.p2{position:relative;height:400vh;height:400svh}
.p2-stage{position:sticky;top:0;height:100vh;height:100svh;overflow:hidden}
.p2-stage canvas{position:absolute;inset:0;width:100%!important;height:100%!important;display:block;touch-action:pan-y}
.p2-cap{position:absolute;left:clamp(20px,4vw,56px);bottom:clamp(24px,6vh,64px);font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;pointer-events:none}
.p2-cap span{position:absolute;left:0;bottom:0;white-space:nowrap;opacity:0;transition:none}
.p2-cap b{display:block;font-weight:600;font-size:clamp(22px,2.4vw,34px);letter-spacing:-.02em;color:#14284B;line-height:1.1}
.p2-cap i{display:block;font-style:normal;font-weight:500;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#5F6675;margin-bottom:8px}
.p2-rail{position:absolute;right:clamp(20px,4vw,56px);bottom:clamp(30px,6vh,70px);display:flex;gap:6px;pointer-events:none}
.p2-rail u{display:block;width:22px;height:2px;background:#D5D9E0;text-decoration:none}
.p2-rail u>s{display:block;height:100%;width:0;background:#14284B}
.p2-still{display:grid;gap:clamp(16px,3vw,32px);padding:clamp(16px,3vw,40px) 0}
.p2-still figure{margin:0}
.p2-still img{width:100%;max-width:960px;height:auto;display:block;margin:0 auto}
.p2-still figcaption{font-family:Inter,system-ui,sans-serif;font-weight:600;color:#14284B;font-size:20px;text-align:center;margin-top:4px}
`;

function injectCSS() {
  if (document.getElementById('p2-css')) return;
  const s = document.createElement('style');
  s.id = 'p2-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) { return false; }
}

function mountStill(el) {
  el.classList.add('p2-still');
  el.innerHTML = FORMS.map((f, i) =>
    `<figure><img src="${HERE(`poster-${f}.webp`)}" width="1600" height="1200" loading="lazy" alt="${CAPTIONS[i]}, built from navy cubes"><figcaption>${CAPTIONS[i]}</figcaption></figure>`
  ).join('');
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const smooth = (t) => t * t * (3 - 2 * t);

// Scroll progress (0..1) -> continuous form index (0..3) with holds on every form.
function formAt(p) {
  const q = clamp01((p - 0.05) / 0.9) * 3;          // short hold at both ends
  const i = Math.min(2, Math.floor(q));
  const x = q - i;
  const HOLD = 0.2;                                 // each side of a transition
  return i + smooth(clamp01((x - HOLD) / (1 - 2 * HOLD)));
}

export async function mount(el) {
  injectCSS();
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || !webglOK()) { mountStill(el); return; }

  let data;
  try {
    data = await (await fetch(HERE('shapes.json?v=2'))).json();
  } catch (e) { mountStill(el); return; }
  const N = data.n;

  el.classList.add('p2');
  el.innerHTML = '';
  const stage = document.createElement('div');
  stage.className = 'p2-stage';
  el.appendChild(stage);

  // ---- captions + progress rail
  const cap = document.createElement('div');
  cap.className = 'p2-cap';
  cap.setAttribute('aria-live', 'polite');
  const capSpans = CAPTIONS.map((t, i) => {
    const s = document.createElement('span');
    s.innerHTML = `<i>0${i + 1} / 04</i><b>${t}</b>`;
    cap.appendChild(s);
    return s;
  });
  const rail = document.createElement('div');
  rail.className = 'p2-rail';
  const railFill = [0, 1, 2].map(() => {
    const u = document.createElement('u'); const s = document.createElement('s');
    u.appendChild(s); rail.appendChild(u); return s;
  });
  stage.appendChild(cap);
  stage.appendChild(rail);

  // ---- renderer
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) {
    el.classList.remove('p2'); el.innerHTML = ''; mountStill(el); return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;   // lights and ground are static: re-render shadows only while cubes move
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.6;   // image-based light: soft realistic reflections on glass, chrome, paint

  const camera = new THREE.PerspectiveCamera(26, 1, 1, 1000);

  // ---- lights: soft hemisphere, key from upper-left front, warm rim from behind right
  scene.add(new THREE.HemisphereLight(0xf4f6fb, 0xb8ac98, 0.6));
  const key = new THREE.DirectionalLight(0xfff8ef, 2.6);
  key.position.set(-18, 56, 34);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 140 });
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.04;
  key.shadow.radius = 7;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffc48c, 1.2);
  rim.position.set(34, 22, -36);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xcfdcff, 0.45);
  fill.position.set(40, 8, 24);
  scene.add(fill);

  // ---- the piece
  const pivot = new THREE.Group();
  scene.add(pivot);
  const fillK = data.fill || 0.97;
  const geo = new RoundedBoxGeometry(fillK, fillK, fillK, 2, (data.bevel || 0.05) * fillK);
  // one PBR material; colour comes from instanceColor, roughness/metalness from a per-instance attribute
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aPbr;\nvarying vec2 vPbr;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPbr = aPbr;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vPbr;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vPbr.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vPbr.y;');
  };
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  const pbrAttr = new THREE.InstancedBufferAttribute(new Float32Array(N * 2), 2);
  pbrAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aPbr', pbrAttr);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  pivot.add(mesh);
  // dark core + cheap shadow caster: plain 12-triangle boxes a little smaller than each cube, sharing its
  // matrix and colour; fills the hairline seams with shade so the surface reads as one solid object
  const proxyGeo = new THREE.BoxGeometry(fillK * 0.93, fillK * 0.93, fillK * 0.93);
  const proxyMat = new THREE.MeshBasicMaterial({ color: 0x3a3a3a });
  const proxy = new THREE.InstancedMesh(proxyGeo, proxyMat, N);
  proxy.instanceMatrix = mesh.instanceMatrix;
  proxy.instanceColor = mesh.instanceColor;
  proxy.castShadow = true;
  proxy.frustumCulled = false;
  pivot.add(proxy);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: 0.07 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  pivot.add(ground);

  // soft contact shadow: the footprint of the cubes near the floor, blurred by down/up-sampling
  // (works everywhere, no ctx.filter), redrawn only when the cubes move
  const CS = 128, EXT = 84;                       // canvas px, world units covered
  const mk = (w) => { const c = document.createElement('canvas'); c.width = c.height = w; return c; };
  const raw = mk(CS), small = mk(40), tiny = mk(14), outC = mk(CS);
  const rx = raw.getContext('2d'), sx = small.getContext('2d'), tx = tiny.getContext('2d'), ox = outC.getContext('2d');
  const contactTex = new THREE.CanvasTexture(outC);
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(EXT, EXT),
    new THREE.MeshBasicMaterial({ alphaMap: contactTex, transparent: true, depthWrite: false, color: 0x0b0d10, toneMapped: false })
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.02;
  contact.renderOrder = -1;
  pivot.add(contact);
  const CUR = new Float32Array(N * 3);
  function drawContact() {
    rx.clearRect(0, 0, CS, CS);
    rx.fillStyle = '#fff';
    const k2 = CS / EXT, h = CS / 2;
    for (let k = 0; k < N; k++) {
      const y = CUR[k * 3 + 1];
      if (y > 3.2) continue;
      rx.globalAlpha = 0.6 * (1 - (y - 0.5) / 2.7);
      rx.fillRect(h + (CUR[k * 3] - 0.5) * k2, h + (CUR[k * 3 + 2] - 0.5) * k2, k2 + 0.4, k2 + 0.4);
    }
    rx.globalAlpha = 1;
    sx.clearRect(0, 0, 40, 40); sx.drawImage(raw, 0, 0, 40, 40);
    tx.clearRect(0, 0, 14, 14); tx.drawImage(raw, 0, 0, 14, 14);
    ox.fillStyle = '#000'; ox.fillRect(0, 0, CS, CS);
    ox.imageSmoothingEnabled = true;
    ox.globalAlpha = 0.8; ox.drawImage(small, 0, 0, CS, CS);
    ox.globalAlpha = 0.55; ox.drawImage(tiny, 0, 0, CS, CS);
    ox.globalAlpha = 1;
    contactTex.needsUpdate = true;
  }

  // ---- per-form data
  const P = FORMS.map((f) => Float32Array.from(data.forms[f]));
  // per-form colour (linear RGB) and PBR (roughness, metalness) per cube
  const tmpC = new THREE.Color();
  const COL = FORMS.map((f) => {
    const src = data.colors ? data.colors[f] : null, a = new Float32Array(N * 3);
    for (let k = 0; k < N; k++) {
      tmpC.setHex(src ? src[k] : NAVY);            // sRGB hex -> linear working space
      a[k * 3] = tmpC.r; a[k * 3 + 1] = tmpC.g; a[k * 3 + 2] = tmpC.b;
    }
    return a;
  });
  const PBR = FORMS.map((f) => {
    const src = data.pbr ? data.pbr[f] : null, a = new Float32Array(N * 2);
    for (let k = 0; k < N; k++) {
      const m = src ? data.mats[src[k]] : [0.45, 0.05];
      a[k * 2] = m[0]; a[k * 2 + 1] = m[1];
    }
    return a;
  });
  const colArr = mesh.instanceColor.array, pbrArr = pbrAttr.array;
  const info = P.map((a) => {
    let x0 = 1e9, x1 = -1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let k = 0; k < N; k++) {
      const x = a[k * 3], y = a[k * 3 + 1], z = a[k * 3 + 2];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y > y1) y1 = y;
      if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    const w = x1 - x0 + 1, h = y1 + 0.5, d = z1 - z0 + 1;
    return { cy: h / 2, rh: 0.5 * Math.hypot(w, d), rv: 0.5 * h, w, h };
  });

  // per-cube randoms (deterministic) and per-transition stagger delays
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const R1 = new Float32Array(N), R2 = new Float32Array(N), AX = new Float32Array(N * 3);
  for (let k = 0; k < N; k++) {
    R1[k] = rnd(); R2[k] = rnd();
    const a = rnd() * Math.PI * 2, b = Math.acos(2 * rnd() - 1);
    AX[k * 3] = Math.sin(b) * Math.cos(a); AX[k * 3 + 1] = Math.sin(b) * Math.sin(a); AX[k * 3 + 2] = Math.cos(b);
  }
  const SPAN = 0.45; // max delay; each cube then travels over (1 - SPAN)
  const DELAY = [0, 1, 2].map((i) => {
    const a = P[i], dl = new Float32Array(N);
    const inf = info[i];
    for (let k = 0; k < N; k++) {
      // sweep: top-left leaves first, a little noise so it never looks mechanical
      const nx = clamp01((a[k * 3] + inf.w / 2) / inf.w);
      const ny = clamp01(1 - a[k * 3 + 1] / inf.h);
      dl[k] = SPAN * clamp01(0.62 * nx + 0.23 * ny + 0.15 * R1[k]);
    }
    return dl;
  });

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s3 = new THREE.Vector3(), ax = new THREE.Vector3();
  let lastF = -1;

  function layout(f) {
    const i = Math.min(2, Math.floor(f));
    const u = f - i;
    const A = P[i], B = P[i + 1], dl = DELAY[i];
    const CA = COL[i], CB = COL[i + 1], QA = PBR[i], QB = PBR[i + 1];
    const ca = info[i], cb = info[i + 1];
    const cy = ca.cy + (cb.cy - ca.cy) * u;
    for (let k = 0; k < N; k++) {
      const j = k * 3;
      const t = clamp01((u - dl[k]) / (1 - SPAN));
      const e = easeInOut(t);
      const arc = Math.sin(Math.PI * t);
      let x = A[j] + (B[j] - A[j]) * e;
      let y = A[j + 1] + (B[j + 1] - A[j + 1]) * e;
      let z = A[j + 2] + (B[j + 2] - A[j + 2]) * e;
      if (arc > 0.0005) {
        // lift and spread away from the centre so the object visibly comes apart
        const dx = x, dy = y - cy, dz = z;
        const len = Math.hypot(dx, dy * 0.6, dz) + 1e-3;
        const spread = arc * (2.5 + 5.0 * R2[k]);
        x += (dx / len) * spread;
        y += (dy / len) * spread * 0.6 + arc * (2.0 + 3.0 * R1[k]);
        z += (dz / len) * spread + arc * 2.0;
        ax.set(AX[j], AX[j + 1], AX[j + 2]);
        q.setFromAxisAngle(ax, arc * (R2[k] > 0.5 ? 1 : -1) * (0.9 + 1.4 * R1[k]));
        const sc = 1 - 0.28 * arc;
        s3.set(sc, sc, sc);
      } else {
        q.identity();
        s3.set(1, 1, 1);
      }
      v.set(x, y, z);
      m4.compose(v, q, s3);
      mesh.setMatrixAt(k, m4);
      CUR[j] = x; CUR[j + 1] = y; CUR[j + 2] = z;
      // colour + finish travel with the cube (written straight into the instanceColor buffer)
      colArr[j] = CA[j] + (CB[j] - CA[j]) * e;
      colArr[j + 1] = CA[j + 1] + (CB[j + 1] - CA[j + 1]) * e;
      colArr[j + 2] = CA[j + 2] + (CB[j + 2] - CA[j + 2]) * e;
      const p2 = k * 2;
      pbrArr[p2] = QA[p2] + (QB[p2] - QA[p2]) * e;
      pbrArr[p2 + 1] = QA[p2 + 1] + (QB[p2 + 1] - QA[p2 + 1]) * e;
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    pbrAttr.needsUpdate = true;
    drawContact();
    renderer.shadowMap.needsUpdate = true;
  }

  // ---- sizing
  let W = 1, H = 1;
  function resize() {
    W = stage.clientWidth || window.innerWidth;
    H = stage.clientHeight || window.innerHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(stage);

  // ---- input
  let targetP = 0, curP = 0, tiltX = 0, tiltY = 0, tX = 0, tY = 0;
  const readScroll = () => {
    const r = el.getBoundingClientRect();
    const total = r.height - window.innerHeight;
    targetP = total > 0 ? clamp01(-r.top / total) : 0;
  };
  readScroll();
  curP = targetP;
  window.addEventListener('scroll', readScroll, { passive: true });
  window.addEventListener('resize', readScroll, { passive: true });
  window.addEventListener('pointermove', (e) => {
    tX = (e.clientX / window.innerWidth - 0.5) * 2;
    tY = (e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });

  let visible = true;
  new IntersectionObserver((ents) => { visible = ents[0].isIntersecting; if (visible) loopStart(); }, { rootMargin: '100px' }).observe(el);

  // ---- camera: 3/4 view from front-right, distance fitted per form
  const YAWS = [0.5, 0.36, 0.42, 0.2], ZOOM = [1, 0.72, 1, 1], PITCH = 0.28, FOV = THREE.MathUtils.degToRad(26);
  function place(f, orbit, lift) {
    const i = Math.min(2, Math.floor(f)), u = f - i;
    const a = info[i], b = info[i + 1];
    const rh = a.rh + (b.rh - a.rh) * u, rv = a.rv + (b.rv - a.rv) * u;
    const cy = a.cy + (b.cy - a.cy) * u;
    const tv = Math.tan(FOV / 2), th = tv * camera.aspect;
    const phone = camera.aspect < 0.8;
    // fit width and height separately (plus depth slack) so wide forms are not tiny
    const fit = Math.max(rh / th * (phone ? 1.22 : 1.5), (rv + rh * Math.sin(PITCH) * 0.6) / tv * 1.3) + rh * 0.5;
    const YAW = YAWS[i] + (YAWS[i + 1] - YAWS[i]) * smooth(u) + orbit;
    const PIT = PITCH + lift;
    const Z = phone ? [1, 1, 1, 1] : ZOOM;                      // phones already fit the width edge to edge
    const zoom = Z[i] + (Z[i + 1] - Z[i]) * smooth(u);   // long, low truck: frame it closer so it fills the stage
    const dist = fit * zoom * (1 + 0.3 * Math.sin(Math.PI * u));
    camera.position.set(Math.sin(YAW) * Math.cos(PIT) * dist, cy + Math.sin(PIT) * dist, Math.cos(YAW) * Math.cos(PIT) * dist);
    camera.lookAt(0, cy * 0.92, 0);
  }

  // ---- loop
  let raf = 0, last = performance.now(), t0 = last;
  function frame(now) {
    raf = 0;
    if (!visible) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    curP += (targetP - curP) * (1 - Math.exp(-dt * 7));
    const f = formAt(curP);
    if (Math.abs(f - lastF) > 1e-5) { layout(f); lastF = f; }

    tiltX += (tX - tiltX) * (1 - Math.exp(-dt * 3));
    tiltY += (tY - tiltY) * (1 - Math.exp(-dt * 3));
    const time = (now - t0) / 1000;
    // slow idle orbit + subtle pointer tilt (camera moves, so the static shadow map stays valid)
    place(f, Math.sin(time * 0.22) * 0.2 - tiltX * 0.14, tiltY * 0.05);

    for (let i = 0; i < 4; i++) {
      const o = clamp01(1 - Math.abs(f - i) * 3);
      capSpans[i].style.opacity = o.toFixed(3);
      capSpans[i].style.transform = `translateY(${((1 - o) * (f > i ? -10 : 10)).toFixed(1)}px)`;
    }
    for (let i = 0; i < 3; i++) railFill[i].style.width = `${(clamp01(f - i) * 100).toFixed(1)}%`;

    renderer.render(scene, camera);
    loopStart();
  }
  function loopStart() { if (!raf) raf = requestAnimationFrame(frame); }
  layout(formAt(curP));
  loopStart();

  return {
    destroy() {
      cancelAnimationFrame(raf); ro.disconnect();
      window.removeEventListener('scroll', readScroll);
      renderer.dispose(); geo.dispose(); mat.dispose(); proxyGeo.dispose(); proxyMat.dispose(); contactTex.dispose();
    },
  };
}
