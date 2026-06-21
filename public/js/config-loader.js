/**
 * Reads the server-injected bio config from a non-executable JSON block
 * (#lumen-config) so the page needs no inline executable script (strict CSP).
 */
(function () {
  try {
    var el = document.getElementById('lumen-config');
    window.siteConfig = el ? JSON.parse(el.textContent) : {};
  } catch (e) {
    window.siteConfig = {};
  }
})();
