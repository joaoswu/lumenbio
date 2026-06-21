/* Landing interactions: staggered reveal, stat + capacity count-ups, hero parallax */
(function () {
  const touch = window.matchMedia('(hover: none)').matches;

  // ---- Staggered scroll reveal ----
  const items = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const i = parseInt(e.target.style.getPropertyValue('--i')) || 0;
        setTimeout(() => e.target.classList.add('in'), Math.min(i * 65, 500));
        io.unobserve(e.target);
      });
    }, { threshold: 0.12 });
    items.forEach(el => io.observe(el));
  } else {
    items.forEach(el => el.classList.add('in'));
  }

  // ---- Count-up helper ----
  function countUp(el, target, dur) {
    if (!el) return;
    const suffix = el.dataset.suffix || '';
    dur = dur || 1100;
    const start = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - t, 3); // easeOutCubic
      el.textContent = Math.round(target * e).toLocaleString() + suffix;
      if (t < 1) requestAnimationFrame(tick);
      else el.textContent = target.toLocaleString() + suffix;
    }
    requestAnimationFrame(tick);
  }

  // ---- Stat counters ----
  const counters = document.querySelectorAll('[data-count]');
  if ('IntersectionObserver' in window) {
    const cio = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        countUp(e.target, parseInt(e.target.dataset.count) || 0);
        cio.unobserve(e.target);
      });
    }, { threshold: 0.4 });
    counters.forEach(c => cio.observe(c));
  } else {
    counters.forEach(c => { c.textContent = (parseInt(c.dataset.count) || 0).toLocaleString() + (c.dataset.suffix || ''); });
  }

  // ---- Spots remaining (single hero badge) ----
  const MAX = 1000;
  fetch('/health')
    .then(r => r.json())
    .then(d => {
      const used = typeof d.users === 'number' ? d.users : 0;
      const remaining = typeof d.remaining === 'number' ? d.remaining : (MAX - used);
      countUp(document.getElementById('spots'), remaining);
    })
    .catch(() => {});

  // ---- Pricing label from Stripe config ----
  fetch('/api/billing/config').then(r => r.json()).then(d => {
    if (d && d.enabled && d.priceLabel) {
      const el = document.getElementById('price-amt');
      if (el) el.textContent = d.priceLabel;
    }
  }).catch(() => {});

  // ---- Hero card cursor parallax (smooth, gentle) ----
  const hero = document.querySelector('.hero');
  const visual = document.querySelector('.hero-visual');
  if (hero && visual && !touch) {
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = null;
    const loop = () => {
      cx += (tx - cx) * 0.08;
      cy += (ty - cy) * 0.08;
      visual.style.transform = `rotateY(${cx.toFixed(2)}deg) rotateX(${cy.toFixed(2)}deg)`;
      if (Math.abs(tx - cx) > 0.04 || Math.abs(ty - cy) > 0.04) {
        raf = requestAnimationFrame(loop);
      } else {
        visual.style.transform = `rotateY(${tx}deg) rotateX(${ty}deg)`;
        raf = null;
      }
    };
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 8;
      ty = ((e.clientY - r.top) / r.height - 0.5) * -8;
      if (!raf) raf = requestAnimationFrame(loop);
    }, { passive: true });
    hero.addEventListener('pointerleave', () => {
      tx = 0; ty = 0;
      if (!raf) raf = requestAnimationFrame(loop);
    });
  }
})();
