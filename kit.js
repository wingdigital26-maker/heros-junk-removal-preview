/* ==========================================================================
   WING HOUSE KIT - kit.js
   Nav (sticky state, burger with focus trap), FAQ disclosure, lead-form
   validation, one quiet rise-in with a failsafe sweep.

   Extracted 2026-09-22 from wing-site-v4/assets/site.js, Wing-specific parts
   removed. Every failsafe in here exists because a build shipped without it:
   - the reveal sweep: IntersectionObserver misses on fast flings, hidden tabs
     and anchor jumps, and copy stayed invisible.
   - inert + Escape + focus trap on the open menu: without it the page behind
     the menu is still tabbable.
   - `js` class set in <head>, NOT here: set late, the page flashes.

   Load with `defer`. Put this in <head> of every page:
     <script>document.documentElement.classList.add('js')</script>
   ========================================================================== */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.add('js');

  /* ---------- nav ---------- */
  var nav = document.querySelector('.site-nav');
  if (nav) {
    var onScroll = function () { nav.classList.toggle('solid', window.scrollY > 24); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    var burger = nav.querySelector('.burger');
    if (burger) {
      var outside = function () {
        return [].slice.call(document.querySelectorAll('body > main, body > .site-footer, body > .skip'));
      };
      var focusables = function () {
        return [].slice.call(nav.querySelectorAll('a[href], button')).filter(function (el) {
          return el.offsetWidth > 0 && el.offsetHeight > 0;
        });
      };
      var setMenu = function (open, returnFocus) {
        nav.classList.toggle('menu-open', open);
        burger.setAttribute('aria-expanded', open ? 'true' : 'false');
        burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        document.body.classList.toggle('menu-locked', open);
        outside().forEach(function (el) { el.inert = open; });
        if (open) {
          var first = nav.querySelector('.navlinks a');
          if (first) first.focus();
        } else if (returnFocus) {
          burger.focus();
        }
      };
      burger.addEventListener('click', function () {
        setMenu(!nav.classList.contains('menu-open'), true);
      });
      document.addEventListener('keydown', function (e) {
        if (!nav.classList.contains('menu-open')) return;
        if (e.key === 'Escape') { e.preventDefault(); setMenu(false, true); return; }
        if (e.key !== 'Tab') return;
        var f = focusables();
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1], act = document.activeElement;
        if (e.shiftKey && (act === first || !nav.contains(act))) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (act === last || !nav.contains(act))) { e.preventDefault(); first.focus(); }
      });
      window.addEventListener('resize', function () {
        if (window.innerWidth > 900 && nav.classList.contains('menu-open')) setMenu(false, false);
      });
    }
  }

  /* ---------- FAQ: real disclosure semantics ---------- */
  document.querySelectorAll('.qa').forEach(function (qa) {
    var btn = qa.querySelector('button');
    var ans = qa.querySelector('.ans');
    if (!btn || !ans) return;
    if (!ans.id) ans.id = 'ans-' + Math.random().toString(36).slice(2, 9);
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', ans.id);
    ans.hidden = true;
    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') === 'true';
      document.querySelectorAll('.qa').forEach(function (o) {
        var b = o.querySelector('button'), a = o.querySelector('.ans');
        if (b && a) { b.setAttribute('aria-expanded', 'false'); a.hidden = true; }
      });
      if (!open) { btn.setAttribute('aria-expanded', 'true'); ans.hidden = false; }
    });
  });

  /* ---------- lead form: inline validation that never blocks a real submit
       and never disables the button (a disabled submit is a conversion-lint
       [A] failure: people cannot tell what is wrong). ---------- */
  document.querySelectorAll('.leadform').forEach(function (form) {
    var messages = {
      name: 'Enter your full name.',
      email: 'Enter a valid email address.',
      phone: 'Enter a phone number with at least 10 digits.',
      message: 'Tell us a little about your business.'
    };
    var fields = Object.keys(messages);
    var errFor = function (input) { return document.getElementById(input.id + '-err'); };
    var showError = function (input, msg) {
      var err = errFor(input);
      input.classList.add('invalid');
      input.setAttribute('aria-invalid', 'true');
      if (err) { err.textContent = msg; err.hidden = false; input.setAttribute('aria-describedby', err.id); }
    };
    var clearError = function (input) {
      var err = errFor(input);
      input.classList.remove('invalid');
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-describedby');
      if (err) { err.textContent = ''; err.hidden = true; }
    };
    var check = function (name, input) {
      var v = input.value.trim();
      var ok = v.length > 0;
      if (ok && name === 'email') ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      if (ok && name === 'phone') ok = v.replace(/\D/g, '').length >= 10;
      return ok;
    };
    fields.forEach(function (name) {
      var input = form.querySelector('[name="' + name + '"]');
      if (!input) return;
      input.addEventListener('input', function () {
        if (input.classList.contains('invalid') && check(name, input)) clearError(input);
      });
    });
    form.addEventListener('submit', function (e) {
      var valid = true;
      fields.forEach(function (name) {
        var input = form.querySelector('[name="' + name + '"]');
        if (!input) return;
        if (check(name, input)) { clearError(input); } else { showError(input, messages[name]); valid = false; }
      });
      if (!valid) {
        e.preventDefault();
        var firstInvalid = form.querySelector('.invalid');
        if (firstInvalid) firstInvalid.focus();
      }
    });
  });

  /* ---------- field: pause a drifting gradient while it is off screen ---------- */
  var flows = [].slice.call(document.querySelectorAll('.field--flow'));
  if (flows.length && !reduced && 'IntersectionObserver' in window) {
    var fio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { e.target.classList.toggle('is-off', !e.isIntersecting); });
    });
    flows.forEach(function (el) { fio.observe(el); });
  }

  /* ---------- ONE quiet rise-in ---------- */
  var rv = [].slice.call(document.querySelectorAll('.rv'));
  if (reduced || !('IntersectionObserver' in window)) {
    rv.forEach(function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        io.unobserve(e.target);
      });
    }, { threshold: 0, rootMargin: '0px 0px -8% 0px' });
    rv.forEach(function (el) { io.observe(el); });

    var sweepQueued = false;
    function sweep() {
      sweepQueued = false;
      var edge = window.innerHeight * 0.96;
      for (var i = rv.length - 1; i >= 0; i--) {
        var el = rv[i];
        if (el.classList.contains('in')) { rv.splice(i, 1); continue; }
        if (el.getBoundingClientRect().top < edge) { el.classList.add('in'); io.unobserve(el); rv.splice(i, 1); }
      }
      if (!rv.length) {
        window.removeEventListener('scroll', queueSweep);
        window.removeEventListener('resize', queueSweep);
      }
    }
    function queueSweep() { if (!sweepQueued) { sweepQueued = true; setTimeout(sweep, 80); } }
    window.addEventListener('scroll', queueSweep, { passive: true });
    window.addEventListener('resize', queueSweep);
    window.addEventListener('load', queueSweep);
    document.addEventListener('visibilitychange', queueSweep);
    window.addEventListener('hashchange', queueSweep);
    queueSweep();
  }
})();
