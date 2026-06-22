/**
 * Lightweight performance guard.
 *
 * On weaker / mobile / reduced-motion devices the most expensive thing on a
 * bio page is particles animating BEHIND the glass cards — every frame forces
 * each backdrop-filter region to recomposite, which is the main cause of lag.
 * Here we detect those devices, add an `html.lite` class (CSS trims blur and
 * stops the always-on decorative animations) and veto particles before the
 * effects module initialises. Runs right after config-loader, before effects.
 */
(function () {
  var mq = window.matchMedia;
  var lite =
    (mq && mq('(max-width: 768px)').matches) ||              // phones
    (navigator.deviceMemory && navigator.deviceMemory <= 4) || // low RAM
    (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) || // few cores
    (mq && mq('(prefers-reduced-motion: reduce)').matches);

  if (!lite) return;
  document.documentElement.classList.add('lite');
  try {
    var p = window.siteConfig && window.siteConfig.theme && window.siteConfig.theme.particles;
    if (p) p.enabled = false;
  } catch (e) { /* config not ready — CSS lite class still applies */ }
})();
