/* Hero's Junk Removal v3: the house that empties itself.
   Poster first (img/house-hero.webp is the LCP). This module only boots the live scene on a desktop with a
   real pointer, no reduced-motion preference and no data-saver, then crossfades the canvas over the poster
   from the exact same camera, so nothing jumps. Phones keep the poster: the gesture reads at a glance there,
   and a megabyte of WebGL for a slow drift is not a fair trade on a phone.
   The scene itself (house-scene.js) is one instanced mesh of fragments driven by scroll and the pointer. */

const piece = document.getElementById('piece');
if (piece) boot();

function ok() {
  const mq = (q) => matchMedia(q).matches;
  if (mq('(prefers-reduced-motion: reduce)')) return false;
  if (!mq('(min-width: 821px)') || !mq('(hover: hover) and (pointer: fine)')) return false;
  const c = navigator.connection;
  if (c && (c.saveData || /2g/.test(c.effectiveType || ''))) return false;
  try {
    const t = document.createElement('canvas');
    return !!(t.getContext('webgl2') || t.getContext('webgl'));
  } catch (_) { return false; }
}

function boot() {
  if (!ok()) {
    // a narrow or reduced-motion load stays on the poster; if only the width was short, try once more when the window grows
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const mq = matchMedia('(min-width: 821px)');
    if (!mq.matches) mq.addEventListener('change', () => { if (ok()) boot(); }, { once: true });
    return;
  }
  // never race the poster: wait for the page to be quiet, then load three
  const start = () => import('./house-scene.js?v=7').then((m) => m.init(piece)).then((h) => { window.__houseScene = h; }).catch((e) => console.warn('house: live scene skipped', e));
  if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 2500 });
  else setTimeout(start, 600);
}
