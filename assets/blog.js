/* Blog index: topic filter chips. Hides cards whose data-topic does not match; the featured guide and the band stay. */
(function () {
  var bar = document.querySelector('.post-filter');
  if (!bar) return;
  var chips = bar.querySelectorAll('.post-chip');
  var cards = document.querySelectorAll('.blog-grid .card.post-card');
  var grid = document.querySelector('.blog-grid');
  function apply(key) {
    for (var i = 0; i < chips.length; i++) {
      var on = chips[i].getAttribute('data-filter') === key;
      chips[i].classList.toggle('is-on', on);
      chips[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    for (var j = 0; j < cards.length; j++) {
      var show = key === 'all' || cards[j].getAttribute('data-topic') === key;
      cards[j].hidden = !show;
    }
    if (grid) grid.setAttribute('data-filter', key);
  }
  bar.addEventListener('click', function (e) {
    var b = e.target.closest('.post-chip');
    if (!b) return;
    apply(b.getAttribute('data-filter'));
    try { history.replaceState(null, '', b.getAttribute('data-filter') === 'all' ? location.pathname : '#' + b.getAttribute('data-filter')); } catch (err) {}
  });
  var h = (location.hash || '').slice(1);
  if (h && bar.querySelector('[data-filter="' + h + '"]')) apply(h);
})();
