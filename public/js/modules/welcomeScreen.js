/**
 * Welcome Screen Module
 * Manages the entrance splash screen with blur effect
 */

class WelcomeScreen {
    constructor() {
        this.welcomeElement = null;
        this.mainContent = null;
        this.isVisible = true;
        
        this.init();
    }

    init() {
        this.createWelcomeScreen();
        
        document.body.classList.add('welcome-active');
    }

    createWelcomeScreen() {
        this.welcomeElement = document.createElement('div');
        this.welcomeElement.className = 'welcome-screen';
        this.welcomeElement.id = 'welcome-screen';

        const welcomeContent = document.createElement('div');
        welcomeContent.className = 'welcome-content';

        const welcomeText = window.siteConfig?.welcomeScreen?.text || 'Click here to continue';

        // Build with DOM APIs so a user's welcome text can't inject markup (stored XSS).
        const button = document.createElement('button');
        button.className = 'welcome-button';
        button.id = 'enter-button';
        const label = document.createElement('span');
        label.textContent = welcomeText;
        button.appendChild(label);
        welcomeContent.appendChild(button);

        this.welcomeElement.appendChild(welcomeContent);
        document.body.appendChild(this.welcomeElement);

        this.mainContent = document.getElementById('main-content') || document.body;

        this.welcomeElement.addEventListener('click', () => {
            this.enterSite();
        });
    }

    enterSite() {
        if (!this.isVisible) return;

        this.isVisible = false;


        const button = this.welcomeElement.querySelector('#enter-button');
        if (button) {
            button.style.transform = 'scale(0.95)';
            button.style.opacity = '0.7';
        }

        document.body.classList.remove('welcome-active');


        this.welcomeElement.classList.add('hidden');

        // Fire the event synchronously so audio.play() retains the user-gesture token
        document.dispatchEvent(new CustomEvent('welcomeScreenDismissed'));

        setTimeout(() => {
            if (this.welcomeElement && this.welcomeElement.parentNode) {
                this.welcomeElement.parentNode.removeChild(this.welcomeElement);
            }
            
            if (this.mainContent) {
                this.mainContent.focus();
            }
        }, 300);
    }

    show() {
        if (!this.isVisible && this.welcomeElement) {
            this.isVisible = true;
            document.body.classList.add('welcome-active');
            this.welcomeElement.classList.remove('hidden');
        }
    }

    hide() {
        if (this.isVisible) {
            this.enterSite();
        }
    }

    static shouldShow() {
        const enabled = window.siteConfig?.welcomeScreen?.enabled;
        return enabled !== false;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (WelcomeScreen.shouldShow()) {
        new WelcomeScreen();
    }
});
window.WelcomeScreen = WelcomeScreen;
