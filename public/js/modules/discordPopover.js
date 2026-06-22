/**
 * Discord Activity Popover
 * Renders a detailed Discord profile card popup synced with real-time Lanyard presence updates.
 */

class DiscordPopover {
    constructor() {
        this.overlay = null;
        this.card = null;
        this.isOpen = false;
        this.activityTimer = null;
        this.init();
    }

    init() {
        // Create the HTML structure dynamically
        this.overlay = document.createElement('div');
        this.overlay.className = 'discord-popover-overlay';
        this.overlay.innerHTML = `
            <div class="discord-popover-card glass">
                <button type="button" class="discord-popover-close" aria-label="Close popover">
                    <i class="fas fa-times" aria-hidden="true"></i>
                </button>
                
                <div class="discord-popover-header">
                    <div class="discord-popover-avatar-wrap">
                        <img class="discord-popover-avatar" alt="Avatar">
                        <div class="discord-popover-status-ring"></div>
                    </div>
                    <div class="discord-popover-user-info">
                        <div class="discord-popover-display-name"></div>
                        <div class="discord-popover-username"></div>
                        <div class="discord-popover-badges"></div>
                    </div>
                </div>
                
                <div class="discord-popover-custom-status" style="display: none;">
                    <span class="custom-status-emoji"></span>
                    <span class="custom-status-text"></span>
                </div>
                
                <div class="divider-thin" style="margin: 0.8rem 0; opacity: 0.5;"></div>
                
                <div class="discord-popover-activity" style="display: none;">
                    <div class="activity-title-label">Playing a Game</div>
                    <div class="activity-content" style="margin-top: 0.4rem;">
                        <div class="activity-assets">
                            <img class="activity-large-image" alt="">
                            <img class="activity-small-image" alt="" style="display: none;">
                        </div>
                        <div class="activity-details">
                            <div class="activity-name"></div>
                            <div class="activity-state"></div>
                            <div class="activity-rich-details"></div>
                        </div>
                    </div>
                    <div class="activity-progress" style="display: none;">
                        <div class="activity-progress-bar-wrap">
                            <div class="activity-progress-bar"></div>
                        </div>
                        <div class="activity-time-labels">
                            <span class="activity-time-current">00:00</span>
                            <span class="activity-time-total">00:00</span>
                        </div>
                    </div>
                </div>
                
                <div class="discord-popover-no-activity">
                    <i class="far fa-smile" aria-hidden="true"></i> No active gaming or streaming session.
                </div>
            </div>
        `;
        
        document.body.appendChild(this.overlay);
        this.card = this.overlay.querySelector('.discord-popover-card');
        this.setupEvents();
    }

    setupEvents() {
        // Toggle on clicking status panel
        document.addEventListener('click', (e) => {
            const statusPanel = e.target.closest('.status-panel');
            if (statusPanel) {
                this.open();
            }
        });

        // Close on clicking close button
        const closeBtn = this.overlay.querySelector('.discord-popover-close');
        closeBtn.addEventListener('click', () => this.close());

        // Close on clicking background
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.close();
            }
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });
    }

    open() {
        this.isOpen = true;
        this.overlay.classList.add('open');
    }

    close() {
        this.isOpen = false;
        this.overlay.classList.remove('open');
    }

    formatDuration(ms) {
        if (ms < 0) ms = 0;
        const totalSecs = Math.floor(ms / 1000);
        const hrs = Math.floor(totalSecs / 3600);
        const mins = Math.floor((totalSecs % 3600) / 60);
        const secs = totalSecs % 60;
        const pad = (n) => String(n).padStart(2, '0');
        if (hrs > 0) {
            return `${hrs}:${pad(mins)}:${pad(secs)}`;
        }
        return `${mins}:${pad(secs)}`;
    }

    update(userData) {
        if (!userData || !userData.discord_user) return;
        const user = userData.discord_user;
        const status = userData.discord_status || 'offline';
        const activities = Array.isArray(userData.activities) ? userData.activities : [];

        // 1. Update Avatar
        const avatarEl = this.card.querySelector('.discord-popover-avatar');
        let avatarUrl = 'https://cdn.discordapp.com/embed/avatars/0.png';
        if (user.avatar) {
            const isGif = user.avatar.startsWith('a_');
            const format = isGif ? 'gif' : 'png';
            avatarUrl = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${format}?size=160`;
        }
        avatarEl.src = avatarUrl;

        // 2. Update Status Ring
        const ringEl = this.card.querySelector('.discord-popover-status-ring');
        const statusColors = {
            online: '#43b581',
            idle: '#faa61a',
            dnd: '#f04747',
            offline: '#747f8d'
        };
        ringEl.style.backgroundColor = statusColors[status] || statusColors.offline;

        // 3. User names
        const displayNameEl = this.card.querySelector('.discord-popover-display-name');
        const usernameEl = this.card.querySelector('.discord-popover-username');
        displayNameEl.textContent = user.global_name || user.username;
        usernameEl.textContent = `@${user.username}`;

        // 4. Discord Badges
        const badgesEl = this.card.querySelector('.discord-popover-badges');
        if (badgesEl && window.discordWidget) {
            badgesEl.innerHTML = window.discordWidget.renderDiscordBadges(user);
        }

        // 5. Custom Status (Activity Type 4)
        const customActivity = activities.find(a => a.type === 4);
        const customStatusEl = this.card.querySelector('.discord-popover-custom-status');
        if (customActivity && (customActivity.state || customActivity.emoji)) {
            const emojiEl = customStatusEl.querySelector('.custom-status-emoji');
            const textEl = customStatusEl.querySelector('.custom-status-text');

            if (customActivity.emoji) {
                if (customActivity.emoji.id) {
                    const isGif = customActivity.emoji.animated;
                    emojiEl.innerHTML = `<img src="https://cdn.discordapp.com/emojis/${customActivity.emoji.id}.${isGif ? 'gif' : 'png'}?size=32" style="width: 1.1rem; height: 1.1rem; vertical-align: middle; margin-right: 4px;">`;
                } else {
                    emojiEl.textContent = customActivity.emoji.name;
                }
            } else {
                emojiEl.textContent = '';
            }

            textEl.textContent = customActivity.state || '';
            customStatusEl.style.display = 'flex';
        } else {
            customStatusEl.style.display = 'none';
        }

        // 6. Active Rich Presence Game or Spotify
        if (this.activityTimer) {
            clearInterval(this.activityTimer);
            this.activityTimer = null;
        }

        const activityEl = this.card.querySelector('.discord-popover-activity');
        const noActivityEl = this.card.querySelector('.discord-popover-no-activity');
        
        let activeActivity = null;
        let isSpotify = false;

        if (userData.listening_to_spotify && userData.spotify) {
            activeActivity = userData.spotify;
            isSpotify = true;
        } else {
            activeActivity = activities.find(a => a.type !== 4);
        }

        if (activeActivity) {
            activityEl.style.display = 'flex';
            noActivityEl.style.display = 'none';

            const titleEl = activityEl.querySelector('.activity-title-label');
            const largeImgEl = activityEl.querySelector('.activity-large-image');
            const smallImgEl = activityEl.querySelector('.activity-small-image');
            const nameEl = activityEl.querySelector('.activity-name');
            const stateEl = activityEl.querySelector('.activity-state');
            const richEl = activityEl.querySelector('.activity-rich-details');
            const progressWrap = activityEl.querySelector('.activity-progress');
            const progressBar = activityEl.querySelector('.activity-progress-bar');
            const timeCurrentEl = activityEl.querySelector('.activity-time-current');
            const timeTotalEl = activityEl.querySelector('.activity-time-total');

            progressWrap.style.display = 'none';

            if (isSpotify) {
                titleEl.textContent = 'LISTENING ON SPOTIFY';
                nameEl.textContent = activeActivity.song || 'Spotify';
                stateEl.textContent = activeActivity.artist ? `by ${activeActivity.artist}` : '';
                richEl.textContent = activeActivity.album ? `on ${activeActivity.album}` : '';

                // Art image
                largeImgEl.src = activeActivity.album_art_url || '';
                largeImgEl.style.display = 'block';
                smallImgEl.style.display = 'none';

                // Spotify progress bar
                if (activeActivity.timestamps) {
                    const start = activeActivity.timestamps.start;
                    const end = activeActivity.timestamps.end;
                    if (start && end && end > start) {
                        progressWrap.style.display = 'block';
                        const totalMs = end - start;
                        timeTotalEl.textContent = this.formatDuration(totalMs);

                        const updateProgress = () => {
                            const currentMs = Date.now() - start;
                            const pct = Math.min(100, Math.max(0, (currentMs / totalMs) * 100));
                            progressBar.style.width = pct + '%';
                            timeCurrentEl.textContent = this.formatDuration(currentMs);
                        };
                        updateProgress();
                        this.activityTimer = setInterval(updateProgress, 1000);
                    }
                }
            } else {
                const typeLabels = { 0: 'PLAYING A GAME', 1: 'STREAMING', 2: 'LISTENING TO', 3: 'WATCHING', 5: 'COMPETING IN' };
                titleEl.textContent = typeLabels[activeActivity.type] || 'PLAYING A GAME';
                nameEl.textContent = activeActivity.name || '';
                stateEl.textContent = activeActivity.details || '';
                richEl.textContent = activeActivity.state || '';

                // Resolve image assets
                const largeAsset = activeActivity.assets?.large_image;
                const smallAsset = activeActivity.assets?.small_image;
                
                let resolvedLarge = '';
                if (largeAsset) {
                    if (largeAsset.startsWith('mp:external/')) {
                        resolvedLarge = 'https://media.discordapp.net/external/' + largeAsset.slice('mp:external/'.length);
                    } else if (largeAsset.startsWith('mp:')) {
                        resolvedLarge = 'https://media.discordapp.net/' + largeAsset.slice('mp:'.length);
                    } else if (activeActivity.application_id) {
                        resolvedLarge = `https://cdn.discordapp.com/app-assets/${activeActivity.application_id}/${largeAsset}.png`;
                    }
                }

                if (resolvedLarge) {
                    largeImgEl.src = resolvedLarge;
                    largeImgEl.style.display = 'block';
                    
                    let resolvedSmall = '';
                    if (smallAsset) {
                        if (smallAsset.startsWith('mp:external/')) {
                            resolvedSmall = 'https://media.discordapp.net/external/' + smallAsset.slice('mp:external/'.length);
                        } else if (smallAsset.startsWith('mp:')) {
                            resolvedSmall = 'https://media.discordapp.net/' + smallAsset.slice('mp:'.length);
                        } else if (activeActivity.application_id) {
                            resolvedSmall = `https://cdn.discordapp.com/app-assets/${activeActivity.application_id}/${smallAsset}.png`;
                        }
                    }
                    if (resolvedSmall) {
                        smallImgEl.src = resolvedSmall;
                        smallImgEl.style.display = 'block';
                    } else {
                        smallImgEl.style.display = 'none';
                    }
                } else {
                    // Fallback to default discord icon
                    largeImgEl.src = 'https://cdn.discordapp.com/embed/avatars/0.png';
                    largeImgEl.style.display = 'block';
                    smallImgEl.style.display = 'none';
                }

                // Game timeline
                if (activeActivity.timestamps && activeActivity.timestamps.start) {
                    progressWrap.style.display = 'block';
                    const start = activeActivity.timestamps.start;
                    const end = activeActivity.timestamps.end;
                    
                    if (end && end > start) {
                        // Time remaining mode
                        const totalMs = end - start;
                        timeTotalEl.textContent = this.formatDuration(totalMs);
                        
                        const updateProgress = () => {
                            const currentMs = Date.now() - start;
                            const pct = Math.min(100, Math.max(0, (currentMs / totalMs) * 100));
                            progressBar.style.width = pct + '%';
                            timeCurrentEl.textContent = this.formatDuration(currentMs);
                        };
                        updateProgress();
                        this.activityTimer = setInterval(updateProgress, 1000);
                    } else {
                        // Elapsed mode
                        progressBar.style.width = '100%';
                        timeTotalEl.textContent = '';
                        
                        const updateElapsed = () => {
                            const elapsedMs = Date.now() - start;
                            timeCurrentEl.textContent = this.formatDuration(elapsedMs) + ' elapsed';
                        };
                        updateElapsed();
                        this.activityTimer = setInterval(updateElapsed, 1000);
                    }
                }
            }
        } else {
            activityEl.style.display = 'none';
            noActivityEl.style.display = 'flex';
        }
    }
}

// Automatically instantiate
document.addEventListener('DOMContentLoaded', () => {
    if (window.siteConfig?.discord?.enabled && window.siteConfig?.discord?.userId) {
        window.discordPopover = new DiscordPopover();
    }
});
