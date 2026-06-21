/**
 * Lumenbio navbar — scroll state and an auth-aware Get Started / Dashboard CTA.
 */
(function () {
  function init() {
    const island = document.querySelector('.nav-island');
    const tabs = Array.from(document.querySelectorAll('.nav-tab'));
    if (!island) return;

    const path = window.location.pathname;
    let active = tabs.find(t => t.dataset.path && t.dataset.path === path)
              || tabs.find(t => t.dataset.path === '/' && path === '/');

    if (active) active.classList.add('active');

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
            cta.innerHTML = '<i class="fas fa-sliders"></i> Dashboard';
            cta.setAttribute('href', '/dashboard');
          }
        })
        .catch(() => {});
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
