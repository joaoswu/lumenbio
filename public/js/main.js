/**
 * Main Application Entry Point
 * Coordinates all modules and initializes the app
 */

document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    if (new URLSearchParams(window.location.search).has('preview')) {
        document.body.classList.add('is-preview');
    }
    TimeUtils.initTimeDisplay(window.siteConfig);
    loadFooterConfig();
}

function loadFooterConfig() {
    if (window.siteConfig && window.siteConfig.footer) {
        const footerElement = document.querySelector('footer p');
        if (footerElement) {
            footerElement.innerHTML = window.siteConfig.footer.text;
        }
    }
}
