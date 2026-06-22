/**
 * Guestbook Module
 * Handles public visitors reading and writing to the profile guestbook
 */

class GuestbookWidget {
    constructor(config) {
        this.config = config;
        this.username = config.username;
        this.enabled = !!(config.guestbook && config.guestbook.enabled);
        this.allowAnonymous = config.guestbook?.allowAnonymous !== false;
        
        this.container = null;
        this.listElement = null;
        this.formElement = null;
        this.submitBtn = null;
        this.errorElement = null;
        this.successElement = null;
        
        this.init();
    }
    
    init() {
        if (!this.enabled || !this.username) {
            this.hideWidget();
            return;
        }
        
        this.createWidgetMarkup();
        this.fetchMessages();
        this.setupFormHandlers();
    }
    
    createWidgetMarkup() {
        // Find main page container to append the guestbook next to the main card
        const page = document.querySelector('.page');
        if (!page) return;
        
        this.container = document.createElement('div');
        this.container.className = 'guestbook-card glass fade-in';
        
        const anonymousPlaceholder = this.allowAnonymous ? ' (optional)' : '';
        const nameRequiredAttr = this.allowAnonymous ? '' : 'required';
        
        this.container.innerHTML = `
            <div class="status-header">
                <span class="status-title"><i class="fas fa-book-open"></i> Guestbook</span>
                <div class="status-indicator">
                    <span class="status-text status-online" id="guestbook-count">0 messages</span>
                </div>
            </div>
            
            <div class="divider-thin"></div>
            
            <div class="guestbook-list" id="gb-list">
                <div class="gb-empty">No messages yet. Be the first to leave one!</div>
            </div>
            
            <div class="divider-thin"></div>
            
            <form class="gb-form" id="gb-form">
                <div class="gb-form-row">
                    <input type="text" id="gb-name" placeholder="Your name${anonymousPlaceholder}" maxlength="30" ${nameRequiredAttr}>
                </div>
                <div class="gb-form-row">
                    <textarea id="gb-msg" placeholder="Write a message..." maxlength="500" required rows="2"></textarea>
                </div>
                <div class="gb-form-actions">
                    <div class="gb-msg-info">
                        <span class="gb-char-count" id="gb-char-count">0/500</span>
                        <span class="gb-error" id="gb-error" hidden></span>
                    </div>
                    <button type="submit" class="gb-submit-btn" id="gb-submit">
                        <i class="fas fa-paper-plane"></i> Send
                    </button>
                </div>
            </form>
        `;
        
        page.appendChild(this.container);
        
        this.listElement = this.container.querySelector('#gb-list');
        this.formElement = this.container.querySelector('#gb-form');
        this.submitBtn = this.container.querySelector('#gb-submit');
        this.errorElement = this.container.querySelector('#gb-error');
        
        // Character count tracker
        const textarea = this.container.querySelector('#gb-msg');
        const charCount = this.container.querySelector('#gb-char-count');
        if (textarea && charCount) {
            textarea.addEventListener('input', () => {
                charCount.textContent = `${textarea.value.length}/500`;
            });
        }
    }
    
    async fetchMessages() {
        try {
            const res = await fetch(`/api/bio/${this.username}/guestbook`);
            if (res.ok) {
                const data = await res.json();
                if (data.success && data.messages) {
                    this.renderMessages(data.messages);
                }
            }
        } catch (e) {
            console.error('Failed to load guestbook messages:', e);
        }
    }
    
    setupFormHandlers() {
        if (!this.formElement) return;
        
        this.formElement.addEventListener('submit', async (e) => {
            e.preventDefault();
            this.clearFeedback();
            
            const nameVal = this.container.querySelector('#gb-name').value.trim();
            const msgVal = this.container.querySelector('#gb-msg').value.trim();
            
            if (!msgVal) return;
            
            this.setLoading(true);
            
            try {
                const res = await fetch(`/api/bio/${this.username}/guestbook`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: nameVal, message: msgVal })
                });
                
                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.error || 'Failed to submit message.');
                }
                
                if (data.success && data.messages) {
                    this.renderMessages(data.messages);
                    this.formElement.reset();
                    const cc = this.container.querySelector('#gb-char-count');
                    if (cc) cc.textContent = '0/500';
                    this.showSuccess('Sent! Thank you ✓');
                }
            } catch (err) {
                this.showError(err.message);
            } finally {
                this.setLoading(false);
            }
        });
    }
    
    renderMessages(messages) {
        const countEl = this.container.querySelector('#guestbook-count');
        if (countEl) {
            countEl.textContent = `${messages.length} message${messages.length === 1 ? '' : 's'}`;
        }
        
        if (!this.listElement) return;
        
        if (messages.length === 0) {
            this.listElement.innerHTML = '<div class="gb-empty">No messages yet. Be the first to leave one!</div>';
            return;
        }
        
        this.listElement.innerHTML = messages.map(msg => {
            const timeStr = this.formatTime(msg.timestamp);
            return `
                <div class="gb-message-card">
                    <div class="gb-message-header">
                        <span class="gb-message-author">${this.escapeHTML(msg.name)}</span>
                        <span class="gb-message-time">${timeStr}</span>
                    </div>
                    <div class="gb-message-text">${this.escapeHTML(msg.message)}</div>
                </div>
            `;
        }).join('');
    }
    
    setLoading(loading) {
        if (!this.submitBtn) return;
        this.submitBtn.disabled = loading;
        this.submitBtn.innerHTML = loading 
            ? '<i class="fas fa-spinner fa-spin"></i>' 
            : '<i class="fas fa-paper-plane"></i> Send';
    }
    
    showError(msg) {
        if (!this.errorElement) return;
        this.errorElement.textContent = msg;
        this.errorElement.hidden = false;
        this.errorElement.style.color = '#f87171'; // Red highlight
    }
    
    showSuccess(msg) {
        if (!this.errorElement) return;
        this.errorElement.textContent = msg;
        this.errorElement.hidden = false;
        this.errorElement.style.color = '#4ade80'; // Green highlight
        setTimeout(() => this.clearFeedback(), 3000);
    }
    
    clearFeedback() {
        if (!this.errorElement) return;
        this.errorElement.textContent = '';
        this.errorElement.hidden = true;
    }
    
    formatTime(isoString) {
        try {
            const date = new Date(isoString);
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            
            if (diffMins < 1) return 'just now';
            if (diffMins < 60) return `${diffMins}m ago`;
            if (diffHours < 24) return `${diffHours}h ago`;
            
            return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        } catch (e) {
            return '';
        }
    }
    
    escapeHTML(str) {
        return String(str || '').replace(/[&<>"']/g, c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    
    hideWidget() {
        const widget = document.querySelector('.guestbook-widget');
        if (widget) {
            widget.remove();
        }
    }
}

// Automatically mount when bio is ready
document.addEventListener('DOMContentLoaded', () => {
    // Check if siteConfig is active and guestbook config is passed
    if (window.siteConfig && window.siteConfig.guestbook) {
        // Wait for welcome screen to dismiss if active, matching the nowPlaying pattern
        const mount = () => new GuestbookWidget(window.siteConfig);
        
        if (document.querySelector('.welcome-screen')) {
            document.addEventListener('welcomeScreenDismissed', mount, { once: true });
        } else {
            setTimeout(mount, 500);
        }
    }
});

window.GuestbookWidget = GuestbookWidget;
