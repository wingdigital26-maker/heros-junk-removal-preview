(function(){
  document.documentElement.classList.add('js');

  /* Header shadow + compact after 40px */
  var header=document.querySelector('.site-header');
  function onScroll(){ if(header){ header.classList.toggle('scrolled', window.scrollY>40); } }
  addEventListener('scroll', onScroll, {passive:true}); onScroll();

  /* Burger menu */
  if(header){
    var burger=header.querySelector('.burger');
    if(burger){
      burger.addEventListener('click', function(){
        var open=header.classList.toggle('menu-open');
        burger.setAttribute('aria-expanded', open?'true':'false');
      });
    }
  }

  /* Reveal on scroll */
  var reveals=document.querySelectorAll('.reveal, .reveal-group');
  if('IntersectionObserver' in window && reveals.length){
    var io=new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){
          entry.target.classList.add('in-view');
          io.unobserve(entry.target);
        }
      });
    }, {threshold:0.12, rootMargin:'0px 0px -40px 0px'});
    reveals.forEach(function(el){ io.observe(el); });
  } else {
    reveals.forEach(function(el){ el.classList.add('in-view'); });
  }
  /* Failsafe: reveal everything after 2.5s no matter what */
  setTimeout(function(){
    reveals.forEach(function(el){ el.classList.add('in-view'); });
  }, 2500);

  /* Hero video parallax */
  var videoWindow=document.querySelector('.video-window');
  var reduced=window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(videoWindow && !reduced){
    var ticking=false;
    function updateParallax(){
      var scrollY=window.scrollY||0;
      var scale=Math.min(1.04, 1 + scrollY/4000);
      videoWindow.style.transform='scale('+scale+')';
      ticking=false;
    }
    addEventListener('scroll', function(){
      if(!ticking){ requestAnimationFrame(updateParallax); ticking=true; }
    }, {passive:true});
  }

  /* Reviews filter */
  var chips=document.querySelectorAll('.chip');
  var cards=document.querySelectorAll('.review-card');
  chips.forEach(function(chip){
    chip.addEventListener('click', function(){
      chips.forEach(function(c){ c.classList.remove('active'); });
      chip.classList.add('active');
      var filter=chip.getAttribute('data-filter');
      cards.forEach(function(card){
        var tags=(card.getAttribute('data-tags')||'').split(',');
        var show = filter==='all' || tags.indexOf(filter)>-1;
        card.classList.toggle('hide', !show);
      });
    });
  });
})();
