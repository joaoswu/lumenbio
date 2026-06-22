/**
 * Performance guard with adaptive fallback.
 *
 * Bio-page lag is almost always GPU compositing: particles + the drifting glow
 * animate behind ~8 backdrop-filter glass regions, forcing a full recomposite
 * every frame. Two layers of defence:
 *   1. Spec sniffing (mobile / low RAM / few cores / reduced-motion) -> `lite`
 *      immediately, before particles initialise.
 *   2. Runtime FPS check after load — catches weak GPUs that look fine on paper
 *      (mid-range laptops, old integrated graphics). Escalates to `lite`, or
 *      `potato` (blur off entirely) when it's really struggling.
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

  function setTier(tier) { // 'lite' or 'potato'
    docEl.classList.add('lite');
    if (tier === 'potato') docEl.classList.add('potato');
    vetoParticles();
    killParticles();
  }

  // --- 1. Static heuristics: apply lite up-front so particles never start ---
  var liteBySpec =
    (mq && mq('(max-width: 768px)').matches) ||
    (navigator.deviceMemory && navigator.deviceMemory <= 4) ||
    (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) ||
    (mq && mq('(prefers-reduced-motion: reduce)').matches);
  if (liteBySpec) { docEl.classList.add('lite'); vetoParticles(); }

  // --- 2. Adaptive: measure real frame rate after load and degrade if poor ---
  function measureFps() {
    if (docEl.classList.contains('potato')) return;
    var frames = 0, start = 0, aborted = false;
    function onVis() { if (document.hidden) aborted = true; }
    document.addEventListener('visibilitychange', onVis);
    function tick(now) {
      if (aborted || document.hidden) { document.removeEventListener('visibilitychange', onVis); return; }
      if (!start) start = now;
      frames++;
      var elapsed = now - start;
      if (elapsed >= 1600) {
        document.removeEventListener('visibilitychange', onVis);
        var fps = (frames * 1000) / elapsed;
        if (fps < 32) setTier('potato');       // genuinely struggling — drop blur entirely
        else if (fps < 50) setTier('lite');     // janky — kill particles + heavy effects
        return;
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  // Let layout settle, then sample. rAF starvation shows up as a low frame count.
  window.addEventListener('load', function () { setTimeout(measureFps, 500); });
})();
