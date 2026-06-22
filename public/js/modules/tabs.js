/**
 * Tab Navigation Module
 * Handles switching active tabs inside the main card stack with smooth transitions.
 */

(function () {
    document.addEventListener('DOMContentLoaded', () => {
        initTabs();
    });

    function initTabs() {
        const tabNav = document.querySelector('.tab-nav');
        if (!tabNav) return;

        const tabButtons = tabNav.querySelectorAll('.tab-btn');
        const tabPanes = document.querySelectorAll('.tab-pane');

        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetTab = btn.getAttribute('data-tab');
                if (!targetTab) return;

                // 1. Update active tab buttons
                tabButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // 2. Switch tab content panes with smooth transitions
                const activePane = document.querySelector('.tab-pane.active');
                const targetPane = document.getElementById(`tab-pane-${targetTab}`);

                if (activePane && targetPane && activePane !== targetPane) {
                    // Transition out: fade out and slide slightly
                    activePane.style.opacity = '0';
                    activePane.style.transform = 'translateY(4px)';

                    // After fade-out duration, hide active, show new target, and fade-in
                    setTimeout(() => {
                        activePane.classList.remove('active');
                        // Reset inline styles
                        activePane.style.opacity = '';
                        activePane.style.transform = '';

                        // Show and slide-in target
                        targetPane.classList.add('active');
                        
                        // Force layout reflow before triggering fade-in transition
                        void targetPane.offsetHeight; 
                    }, 150); // Matches transitions
                } else if (targetPane) {
                    // Fallback to instant swap if active pane not found or same
                    tabPanes.forEach(p => p.classList.remove('active'));
                    targetPane.classList.add('active');
                }
            });
        });
    }
})();
