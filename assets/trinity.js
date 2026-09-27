(function(){
  document.documentElement.classList.add('js');

  var burger = document.querySelector('.t-burger');
  var menu = document.querySelector('.t-mobile-menu');
  function setMenu(open){
    menu.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('t-menu-open', open);
  }
  if(burger && menu){
    burger.addEventListener('click', function(){ setMenu(!menu.classList.contains('open')); });
    menu.querySelectorAll('a').forEach(function(a){
      a.addEventListener('click', function(){ setMenu(false); });
    });
    document.addEventListener('keydown', function(e){ if(e.key==='Escape' && menu.classList.contains('open')){ setMenu(false); burger.focus(); } });
    window.addEventListener('resize', function(){ if(window.innerWidth>1000 && menu.classList.contains('open')) setMenu(false); });
  }

  // header panels (Where we go, What we haul): the caret toggles them for touch and keyboard; hover opens them in CSS
  var items = Array.prototype.slice.call(document.querySelectorAll('.t-has-menu'));
  function closeMenus(except){ items.forEach(function(it){ if(it!==except){ it.classList.remove('open'); var b=it.querySelector('.t-nav-caret'); if(b) b.setAttribute('aria-expanded','false'); } }); }
  items.forEach(function(it){
    var b=it.querySelector('.t-nav-caret'); if(!b) return;
    b.addEventListener('click', function(e){ e.stopPropagation(); var open=!it.classList.contains('open'); closeMenus(it); it.classList.toggle('open',open); b.setAttribute('aria-expanded',String(open)); });
    it.addEventListener('mouseleave', function(){ it.classList.remove('open'); b.setAttribute('aria-expanded','false'); });
  });
  document.addEventListener('click', function(e){ if(!e.target.closest || !e.target.closest('.t-has-menu')) closeMenus(); });
  document.addEventListener('keydown', function(e){
    if(e.key!=='Escape') return;
    var open=items.filter(function(it){ return it.classList.contains('open') || it.contains(document.activeElement); })[0];
    closeMenus();
    if(open){ var b=open.querySelector('.t-nav-caret'); if(b && open.contains(document.activeElement)) b.focus(); }
  });
  // keyboard: leaving a panel with Tab closes it
  items.forEach(function(it){ it.addEventListener('focusout', function(){ setTimeout(function(){ if(!it.contains(document.activeElement)){ it.classList.remove('open'); var b=it.querySelector('.t-nav-caret'); if(b) b.setAttribute('aria-expanded','false'); } },0); }); });

  // marquee: duplicate the run so the loop is seamless
  document.querySelectorAll('.t-marquee-track').forEach(function(t){ t.innerHTML += t.innerHTML; });

  var els = Array.prototype.slice.call(document.querySelectorAll('.rise'));

  // cards in a sideways rail (phones) sit off-screen horizontally, so the rail reveals as one
  function reveal(el){
    el.classList.add('in');
    var rail=el.closest && el.closest('.t-rv-grid');
    if(rail) rail.querySelectorAll('.rise, .t-reveal-img').forEach(function(x){ x.classList.add('in'); });
  }

  if('IntersectionObserver' in window){
    var io = new IntersectionObserver(function(entries){
      // stagger: everything that arrives in one batch reveals in reading order (top to bottom, left to right)
      var batch=entries.filter(function(e){ return e.isIntersecting; }).map(function(e){ return e.target; });
      batch.sort(function(a,b){ var ra=a.getBoundingClientRect(), rb=b.getBoundingClientRect(); return (ra.top-rb.top) || (ra.left-rb.left); });
      batch.forEach(function(el,i){
        el.style.transitionDelay=Math.min(i*90,450)+'ms';
        reveal(el);
        io.unobserve(el);
      });
    }, {threshold:0.15, rootMargin:'0px 0px -60px 0px'});
    els.forEach(function(el){ io.observe(el); });
  } else {
    els.forEach(reveal);
  }

  // Failsafe only for what is already on screen at load (never pre-reveal what is below the fold).
  setTimeout(function(){
    els.forEach(function(el){ var r=el.getBoundingClientRect(); if(r.top<window.innerHeight) reveal(el); });
  }, 2500);

  // Inner pages: .reveal / .reveal-group fade up as they enter (never pre-revealed below the fold)
  var olds=Array.prototype.slice.call(document.querySelectorAll('.reveal, .reveal-group'));
  if(olds.length){
    if('IntersectionObserver' in window){
      var io3=new IntersectionObserver(function(es){ es.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('in-view'); io3.unobserve(e.target); } }); },{threshold:0.12, rootMargin:'0px 0px -40px 0px'});
      olds.forEach(function(el){ io3.observe(el); });
      setTimeout(function(){ olds.forEach(function(el){ if(el.getBoundingClientRect().top<window.innerHeight) el.classList.add('in-view'); }); }, 2500);
    } else olds.forEach(function(el){ el.classList.add('in-view'); });
  }

  // Photos: curtain reveal as they enter.
  // Observe each photo's PARENT: a clipped/translated element reports zero intersection and would never open.
  var imgs=Array.prototype.slice.call(document.querySelectorAll('.t-hero-photo, .t-coverage-photo, .t-work-card, .t-review-photo, .t-rv-feature-photo, .t-rv-photo, .t-close-photo'));
  imgs.forEach(function(el){ el.classList.add('t-reveal-img'); if(io) io.unobserve(el); });
  if('IntersectionObserver' in window){
    var io2=new IntersectionObserver(function(es){ es.forEach(function(e){ if(e.isIntersecting){ e.target.__imgs.forEach(function(i){ reveal(i); }); io2.unobserve(e.target); } }); },{threshold:0,rootMargin:'0px 0px -12% 0px'});
    imgs.forEach(function(el){ var p=el.parentElement; (p.__imgs=p.__imgs||[]).push(el); io2.observe(p); });
  } else imgs.forEach(function(el){ el.classList.add('in'); });

  // Wordmarks: split into letters, rise one by one when they come into view; apostrophe in red.
  document.querySelectorAll('.t-wordmark, .t-footer-wordmark').forEach(function(wm){
    var t=wm.textContent; wm.textContent='';
    Array.prototype.forEach.call(t,function(c,i){
      var s=document.createElement('span'); s.className='t-ch'; s.textContent=c===' '?' ':c;
      s.style.transitionDelay=(i*35)+'ms'; wm.appendChild(s);
    });
    wm.setAttribute('aria-label',t);
    if('IntersectionObserver' in window){
      var o=new IntersectionObserver(function(es){ es.forEach(function(e){ if(e.isIntersecting){ wm.classList.add('t-wm-in'); o.disconnect(); } }); },{threshold:0.3});
      o.observe(wm);
    } else wm.classList.add('t-wm-in');
  });

  // Inset photos drift against the scroll (parallax).
  var insets=Array.prototype.slice.call(document.querySelectorAll('.t-inset'));
  if(insets.length && !window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    var tick=false;
    window.addEventListener('scroll',function(){
      if(tick) return; tick=true;
      requestAnimationFrame(function(){
        insets.forEach(function(el){ var r=el.parentElement.getBoundingClientRect(); var p=(r.top+r.height/2-window.innerHeight/2)/window.innerHeight; el.style.transform='translateY('+(p*-60).toFixed(1)+'px)'; });
        tick=false;
      });
    },{passive:true});
  }
})();

/* fit the giant wordmarks to their container width on one line (desktop), like the reference */
(function(){
  var els=document.querySelectorAll('.t-wordmark, .t-footer-wordmark');
  function fit(){
    els.forEach(function(el){
      if(window.innerWidth<760){ el.style.fontSize=''; return; }
      el.style.whiteSpace='nowrap'; el.style.fontSize='100px';
      var cs=getComputedStyle(el), w=el.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight);
      var r=document.createRange(); r.selectNodeContents(el); var tw=r.getBoundingClientRect().width;
      if(tw>0) el.style.fontSize=Math.floor(100*w/tw*0.99)+'px';
    });
  }
  if(document.fonts&&document.fonts.ready) document.fonts.ready.then(fit);
  window.addEventListener('resize',fit); fit();
})();

/* direction: header progress line, section rail (current section, dark over the footer) */
(function(){
  var bar=document.querySelector('.t-progress');
  var rail=document.querySelector('.t-rail');
  var links=rail?Array.prototype.slice.call(rail.querySelectorAll('a')):[];
  links.forEach(function(a){ var t=a.textContent; a.textContent=''; var s=document.createElement('span'); s.textContent=t; a.appendChild(s); });
  var secs=links.map(function(a){ return document.getElementById(a.getAttribute('href').slice(1)); });
  var footer=document.querySelector('.t-footer');
  var navs=Array.prototype.slice.call(document.querySelectorAll('.t-nav a[href^="#"]'));
  var tick=false;
  function update(){
    tick=false;
    var max=document.documentElement.scrollHeight-window.innerHeight;
    if(bar) bar.style.transform='scaleX('+(max>0?Math.min(1,window.scrollY/max):0).toFixed(4)+')';
    if(!links.length) return;
    var line=window.innerHeight*0.45, cur=-1;
    secs.forEach(function(s,i){ if(s && s.getBoundingClientRect().top<=line) cur=i; });
    links.forEach(function(a,i){ a.classList.toggle('cur',i===cur); });
    var id=cur>=0&&secs[cur]?secs[cur].id:'';
    navs.forEach(function(a){ a.classList.toggle('cur', !!id && a.getAttribute('href')==='#'+id); });
    if(footer) rail.classList.toggle('on-dark', footer.getBoundingClientRect().top<window.innerHeight*0.5);
  }
  window.addEventListener('scroll',function(){ if(!tick){ tick=true; requestAnimationFrame(update); } },{passive:true});
  window.addEventListener('resize',update);
  update();
})();
