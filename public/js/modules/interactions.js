/**
 * Interactions Module
 * Pointer-reactive flourish: a subtle 3D tilt on the main card.
 * Config-driven and respects reduced-motion / touch devices.
 */

(function () {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isTouch = window.matchMedia('(hover: none)').matches;

    document.addEventListener('DOMContentLoaded', function () {
        const effects = window.siteConfig?.theme?.effects || {};
        // Tilt is a gentle pointer effect; run it regardless of the (preview-forced)
        // reduced-motion flag so it actually works. Still skipped on touch devices.
        if (!isTouch && effects.tilt !== false) initTilt();
    });

    function initTilt() {
        const wrap = document.querySelector('.tilt-wrap');
        const page = document.querySelector('.page');
        if (!wrap || !page) return;

        page.style.perspective = '1100px';
        wrap.style.transformStyle = 'preserve-3d';
        wrap.style.transition = 'transform 0.25s ease-out';

        const MAX = 4; // degrees
        let raf = null;

        window.addEventListener('pointermove', (e) => {
            if (raf) return;
            raf = requestAnimationFrame(() => {
                const cx = window.innerWidth / 2;
                const cy = window.innerHeight / 2;
                const rx = ((e.clientY - cy) / cy) * -MAX;
                const ry = ((e.clientX - cx) / cx) * MAX;
                wrap.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
                raf = null;
            });
        }, { passive: true });

        document.addEventListener('mouseleave', () => {
            wrap.style.transform = 'rotateX(0deg) rotateY(0deg)';
        });
    }
})();
