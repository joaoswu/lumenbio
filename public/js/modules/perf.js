/**
 * Performance guard with adaptive, self-escalating fallback.
 *
 * Bio-page lag is almost always GPU compositing: particles + the drifting glow
 * animate behind ~8 backdrop-filter glass regions, forcing a full recomposite
 * every frame. Spec sniffing alone misses weak desktops (they report plenty of
 * cores/RAM), so we ALSO measure the real frame rate after load and step down
 * through tiers until the page is actually smooth:
 *
 *   full  -> lite   : kill particles + heavy behind-glass animations
 *   lite  -> potato : drop backdrop-filter blur entirely (blur(0))
 */
(function () {
  var docEl = document.documentElement;
  var mq = window.matchMedia;

  function vetoParticles() {
    try {
      var p = window.siteConfig && window.siteConfig.theme && window.siteConfig.theme.particles;
      if (p) p.enabled = false;
    } catch (e) { /* config not ready */ }
  }

  function killParticles() {
    try {
      if (window.pJSDom && window.pJSDom.length) {
        window.pJSDom.forEach(function (x) { try { x.pJS.fn.vendors.destroypJS(); } catch (e) {} });
        window.pJSDom = [];
      }
      var el = document.getElementById('particles-js');
      if (el) el.remove();
    } catch (e) { /* noop */ }
  }

  // tier: 1 = lite, 2 = potato
  var current = 0;
  function applyTier(tier) {
    if (tier < 1 || tier <= current) return;
    current = tier;
    docEl.classList.add('lite');
    if (tier >= 2) docEl.classList.add('potato');
    vetoParticles();
    killParticles();
  }

  // --- 1. Static heuristics: apply lite up-front so particles never start ---
  var liteBySpec =
    (mq && mq('(max-width: 768px)').matches) ||
    (navigator.deviceMemory && navigator.deviceMemory <= 4) ||
    (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) ||
    (mq && mq('(prefers-reduced-motion: reduce)').matches);
  if (liteBySpec) applyTier(1);

  // --- 2. Adaptive: measure FPS, drop a tier if poor, then re-measure ---
  var MIN_FPS = 50;
  function sampleFps(cb) {
    var frames = 0, start = 0, aborted = false;
    function onVis() { if (document.hidden) aborted = true; }
    document.addEventListener('visibilitychange', onVis);
    function tick(now) {
      if (aborted || document.hidden) { document.removeEventListener('visibilitychange', onVis); return; } // ignore hidden tabs
      if (!start) start = now;
      frames++;
      var elapsed = now - start;
      if (elapsed >= 1200) {
        document.removeEventListener('visibilitychange', onVis);
        cb((frames * 1000) / elapsed);
        return;
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function autoTune() {
    sampleFps(function (fps) {
      if (fps >= MIN_FPS || current >= 2) return; // smooth enough, or already at the floor
      applyTier(current + 1);
      setTimeout(autoTune, 400); // let the change settle, then re-check
    });
  }

  // Let layout settle, then start tuning.
  window.addEventListener('load', function () { setTimeout(autoTune, 500); });
})();
