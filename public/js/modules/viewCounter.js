/**
 * View Counter Module
 * Displays the per-user view count injected into the bio config by the server.
 */

document.addEventListener('DOMContentLoaded', function () {
    const cfg = window.siteConfig || {};
    if (!cfg.features || !cfg.features.viewCounter) return;

    const wrap = document.getElementById('view-counter');
    const num = document.getElementById('view-count');
    if (!wrap || !num) return;

    if (typeof cfg.views === 'number') {
        num.textContent = cfg.views.toLocaleString();
        wrap.hidden = false;
    }
});
