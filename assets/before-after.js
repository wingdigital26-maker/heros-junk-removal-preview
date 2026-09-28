/* Hero's Junk Removal: BEFORE / AFTER drag slider (see assets/before-after.css).
 * The native range input over the photo does the work: mouse drag, touch drag and arrow keys all move it.
 * This only mirrors its value into --ba-pos so the before photo's clip and the knob follow. */
(function () {
  var sliders = document.querySelectorAll('[data-ba-slider]');
  Array.prototype.forEach.call(sliders, function (s) {
    var r = s.querySelector('.ba-range');
    if (!r) return;
    function set() { s.style.setProperty('--ba-pos', r.value + '%'); }
    r.addEventListener('input', set);
    r.addEventListener('change', set);
    r.addEventListener('pointerdown', function () { s.classList.add('is-dragging'); });
    window.addEventListener('pointerup', function () { s.classList.remove('is-dragging'); });
    set();
  });
})();
