/* Hero's Junk Removal: calm wheel scrolling.
 * A small Lenis-style lerp for mouse wheels and trackpads only. Touch, keyboard, anchor links, hash jumps,
 * the header panels and the phone menu stay native. Off under prefers-reduced-motion and on touch devices.
 * If anything else moves the page (keyboard, an anchor, a hash), the lerp resyncs to where the page is. */
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var coarse = window.matchMedia('(hover: none), (pointer: coarse)');
  if (reduce.matches || coarse.matches || !('requestAnimationFrame' in window)) return;
  var doc = document.documentElement;
  var LERP = 0.09, cur = window.scrollY, target = cur, raf = 0, last = 0, mine = false;
  function maxY() { return Math.max(0, doc.scrollHeight - window.innerHeight); }
  function scrollable(el) {
    for (var e = el; e && e !== document.body && e !== doc; e = e.parentElement) {
      if (e.tagName === 'TEXTAREA' || e.tagName === 'SELECT') return true;
      var cs = getComputedStyle(e), oy = cs.overflowY, ox = cs.overflowX;
      if ((oy === 'auto' || oy === 'scroll') && e.scrollHeight > e.clientHeight + 1) return true;
      if ((ox === 'auto' || ox === 'scroll') && e.scrollWidth > e.clientWidth + 1) return true;
    }
    return false;
  }
  function frame(now) {
    raf = 0;
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60; last = now;
    var k = 1 - Math.pow(1 - LERP, dt * 60);
    cur += (target - cur) * k;
    if (Math.abs(target - cur) < 0.4) cur = target;
    mine = true;
    doc.style.scrollBehavior = 'auto';
    window.scrollTo(0, cur);
    doc.style.scrollBehavior = '';
    mine = false;
    if (cur !== target) raf = requestAnimationFrame(frame); else last = 0;
  }
  window.addEventListener('wheel', function (e) {
    if (e.ctrlKey || e.defaultPrevented) return;                  // pinch zoom
    if (document.body.classList.contains('t-menu-open')) return;  // phone menu owns the page
    if (scrollable(e.target)) return;                             // inner scrollers stay native
    var d = e.deltaY;
    if (e.deltaMode === 1) d *= 16; else if (e.deltaMode === 2) d *= window.innerHeight;
    e.preventDefault();
    if (!raf) { cur = window.scrollY; target = cur; }
    target = Math.max(0, Math.min(maxY(), target + d));
    if (!raf) raf = requestAnimationFrame(frame);
  }, { passive: false });
  window.addEventListener('scroll', function () {
    if (mine || Math.abs(window.scrollY - cur) < 1.5) return;     // our own frame; otherwise the page moved by
    cur = target = window.scrollY;                                // other means (keys, anchor, hash): resync
    if (raf) { cancelAnimationFrame(raf); raf = 0; last = 0; }
  }, { passive: true });
  reduce.addEventListener && reduce.addEventListener('change', function (ev) { if (ev.matches) { target = cur = window.scrollY; } });
  doc.classList.add('lerp-scroll');
})();
