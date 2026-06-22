/**
 * Link-click tracking — fires a lightweight beacon when a visitor clicks an
 * outbound link on the bio page. Counts surface in the owner's Premium analytics.
 */
(function () {
  var cfg = window.siteConfig || {};
  var username = cfg.username;
  if (!username) return;

  function labelFor(a) {
    var d = a.getAttribute('data-track');
    if (d) return d.slice(0, 80);
    var aria = a.getAttribute('aria-label');
    if (aria) return aria.trim().slice(0, 80);
    var txt = (a.textContent || '').replace(/\s+/g, ' ').trim();
    if (txt) return txt.slice(0, 80);
    try { return new URL(a.href).hostname.replace(/^www\./, '').slice(0, 80); }
    catch (e) { return 'link'; }
  }

  function send(label) {
    if (!label) return;
    var url = '/api/bio/' + encodeURIComponent(username) + '/click';
    try {
      var body = JSON.stringify({ label: label });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      } else {
        fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () {});
      }
    } catch (e) { /* tracking is best-effort */ }
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || !a.closest('#main-content')) return;   // only links inside the card
    if (a.id === 'lumen-credit') return;             // don't count the credit badge
    var raw = a.getAttribute('href') || '';
    if (raw.charAt(0) === '#') return;               // skip in-page anchors
    if (!/^https?:$/i.test(a.protocol)) return;      // skip mailto:/tel:/etc.
    send(labelFor(a));
  }, true);
})();
