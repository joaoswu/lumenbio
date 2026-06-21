/**
 * Lumenbio navbar — sliding "dynamic island" indicator, scroll state,
 * and an auth-aware Get Started / Dashboard CTA.
 */
(function () {
  function init() {
    const island = document.querySelector('.nav-island');
    const tabsWrap = document.querySelector('.nav-tabs');
    const indicator = document.querySelector('.nav-indicator');
    const tabs = Array.from(document.querySelectorAll('.nav-tab'));
    if (!island) return;

    const path = window.location.pathname;
    let active = tabs.find(t => t.dataset.path && t.dataset.path === path)
              || tabs.find(t => t.dataset.path === '/' && path === '/');

    function moveTo(tab) {
      if (!tab || !indicator || !tabsWrap) return;
      const wrapBox = tabsWrap.getBoundingClientRect();
      const box = tab.getBoundingClientRect();
      indicator.style.left = (box.left - wrapBox.left) + 'px';
      indicator.style.width = box.width + 'px';
      indicator.style.opacity = '1';
    }
    function reset() { active ? moveTo(active) : (indicator && (indicator.style.opacity = '0')); }

    if (active) active.classList.add('active');
    requestAnimationFrame(reset);

    tabs.forEach(tab => {
      tab.addEventListener('mouseenter', () => moveTo(tab));
      tab.addEventListener('focus', () => moveTo(tab));
    });
    if (tabsWrap) {
      tabsWrap.addEventListener('mouseleave', reset);
      tabsWrap.addEventListener('blurout', reset);
    }
    window.addEventListener('resize', reset);

    // Scroll state
    const onScroll = () => island.classList.toggle('scrolled', window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // Auth-aware CTA
    const cta = document.querySelector('.nav-cta[data-auth-cta]');
    if (cta) {
      fetch('/api/auth/me')
        .then(r => r.json())
        .then(d => {
          if (d.user) {
            cta.innerHTML = '<i class="fas fa-gauge-high"></i> Dashboard';
            cta.setAttribute('href', '/dashboard');
          }
        })
        .catch(() => {});
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
