/* ============================================================
   MANTAF v2 — LANDING.JS
   Landing page: scroll, reveal, counter, partikel, enter app
   ============================================================ */

/* ---------- ENTER PLATFORM ---------- */
function enterPlatform(){
  const landing = document.getElementById('landingPage');
  const app = document.getElementById('appWrapper');
  if(landing) landing.classList.add('hidden-landing');
  if(app){
    app.style.display = 'block';
    setTimeout(function(){ app.classList.add('show-app'); }, 50);
  }
  document.body.style.overflow = '';
  window.scrollTo(0, 0);
  setTimeout(stopParticles, 800);
  /* buka dashboard */
  showSection('dashboard', document.querySelector('.menu button[data-section="dashboard"]'));
}

/* ---------- SCROLL TO SECTION ---------- */
function scrollToSection(id){
  const el = document.getElementById(id);
  if(el) el.scrollIntoView({ behavior:'smooth', block:'start' });
}

/* ---------- MOBILE MENU LANDING ---------- */
function toggleMobileMenu(){
  const menu = document.getElementById('lpMobileMenu');
  if(menu) menu.classList.toggle('open');
}
function closeMobileMenu(){
  const menu = document.getElementById('lpMobileMenu');
  if(menu) menu.classList.remove('open');
}

/* ---------- INIT LANDING ---------- */
function initLandingPage(){
  document.body.style.overflow = 'hidden';

  initParticles();

  window.addEventListener('scroll', function(){
    const nav = document.getElementById('lpNav');
    if(nav){
      if(window.scrollY > 60) nav.classList.add('scrolled');
      else nav.classList.remove('scrolled');
    }
  });

  initScrollReveal();
  initCounters();

  document.addEventListener('click', function(e){
    const btn = e.target.closest('.lp-btn-primary, .lp-nav-btn');
    if(btn){
      const ripple = document.createElement('span');
      ripple.className = 'ripple';
      const rect = btn.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
      ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
      btn.appendChild(ripple);
      setTimeout(function(){ ripple.remove(); }, 600);
    }
  });
}

/* ---------- PARTICLES ---------- */
let _particleAnimId = null;
let _particleResize = null;

function stopParticles(){
  if(_particleAnimId){ cancelAnimationFrame(_particleAnimId); _particleAnimId = null; }
  if(_particleResize) window.removeEventListener('resize', _particleResize);
}

function initParticles(){
  const canvas = document.getElementById('particlesCanvas');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  const particles = [];
  const count = 40;

  _particleResize = function(){
    const parent = canvas.parentElement;
    if(!parent) return;
    canvas.width = parent.offsetWidth;
    canvas.height = parent.offsetHeight;
  };
  _particleResize();
  window.addEventListener('resize', _particleResize);

  for(let i = 0; i < count; i++){
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 2 + 0.5,
      dx: (Math.random() - 0.5) * 0.4,
      dy: (Math.random() - 0.5) * 0.4,
      opacity: Math.random() * 0.4 + 0.1
    });
  }

  function draw(){
    const landing = document.getElementById('landingPage');
    if(!landing || landing.classList.contains('hidden-landing')){
      _particleAnimId = null;
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for(let i = 0; i < particles.length; i++){
      const p = particles[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(16,185,129,' + p.opacity + ')';
      ctx.fill();
      p.x += p.dx; p.y += p.dy;
      if(p.x < 0 || p.x > canvas.width) p.dx *= -1;
      if(p.y < 0 || p.y > canvas.height) p.dy *= -1;
      for(let j = i + 1; j < particles.length; j++){
        const p2 = particles[j];
        const dx = p.x - p2.x, dy = p.y - p2.y;
        const distSq = dx * dx + dy * dy;
        if(distSq < 14400){
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = 'rgba(16,185,129,' + (0.08 * (1 - Math.sqrt(distSq) / 120)) + ')';
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
    _particleAnimId = requestAnimationFrame(draw);
  }
  _particleAnimId = requestAnimationFrame(draw);
}

/* ---------- SCROLL REVEAL ---------- */
function initScrollReveal(){
  const reveals = document.querySelectorAll('.lp-reveal');
  if(!reveals.length) return;
  const observer = new IntersectionObserver(function(entries){
    entries.forEach(function(entry){
      if(entry.isIntersecting) entry.target.classList.add('revealed');
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
  reveals.forEach(function(el){ observer.observe(el); });
}

/* ---------- COUNTERS ---------- */
function initCounters(){
  const counters = document.querySelectorAll('.lp-stat-number');
  if(!counters.length) return;
  const observer = new IntersectionObserver(function(entries){
    entries.forEach(function(entry){
      if(entry.isIntersecting){
        animateCounter(entry.target);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });
  counters.forEach(function(el){ observer.observe(el); });
}

function animateCounter(el){
  const target = parseInt(el.getAttribute('data-target'), 10) || 0;
  let current = 0;
  const increment = Math.max(1, Math.ceil(target / 80));
  const stepTime = 2000 / (target / increment);
  function step(){
    current += increment;
    if(current >= target){ el.textContent = target.toLocaleString('id-ID'); return; }
    el.textContent = current.toLocaleString('id-ID');
    setTimeout(step, stepTime);
  }
  step();
}
