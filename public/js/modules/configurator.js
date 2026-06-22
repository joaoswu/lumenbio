
function applyTheme(config) {
    const accent = config.theme?.accentColor;
    if (accent && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(accent)) {
        document.documentElement.style.setProperty('--color-primary', accent);
    }

    // Custom cursor (Premium) — only safe http(s) image URLs.
    const cursor = config.theme?.effects?.cursor;
    if (cursor && /^https?:\/\//i.test(cursor)) {
        document.body.style.cursor = 'url("' + cursor.replace(/["')]/g, '') + '") 0 0, auto';
    }
}

window.applyTheme = applyTheme;

document.addEventListener('DOMContentLoaded', async function() {
    const config = window.siteConfig;

    if (!config) {
        return;
    }

    applyTheme(config);

    if (window.FontManager) {
        const fontManager = new FontManager();
        await fontManager.initializeFromConfig(config);
        window.fontManager = fontManager;
    }

    setupProfile(config.profile);

    setupSocialLinks(config.socialMedia);

    renderCustomLinks(config.customLinks);
    applyBranding(config.removeBranding);
    
    if (config.locations.enabled === true) {
        setupLocationRotation(config.locations);
    } else {

        const locationElement = document.querySelector('.location-text');
        const locationRow = locationElement?.closest('.status-row');
        if (locationRow) {
            locationRow.style.display = 'none';
        }
    }
    
    if (window.BackgroundManager) {
        const backgroundManager = new BackgroundManager(config);
    }
    
    if (window.VisualEffectsManager) {
        const effectsManager = new VisualEffectsManager(config);
    }
    
    if (config.lastfm && config.lastfm.enabled && config.lastfm.username && window.LastFmService) {
        initializeLastFmWidget(config.lastfm);
    } else {
        const fab = document.getElementById('lastfm-fab');
        if (fab) fab.hidden = true;
    }

    if (config.discord && config.discord.enabled && config.discord.userId && window.DiscordWidget) {
        const discordWidget = new DiscordWidget(config);
        window.discordWidget = discordWidget;

        discordWidget.onUserDataReceived = (userData) => {
            // Passing the value (or undefined) lets the helper add OR remove the decoration.
            applyDiscordDecorationToProfile(userData.discord_user?.avatar_decoration_data);

            updateDiscordStatus(userData.discord_status, userData.discord_user);

            if (config.discord.showBadges && userData.discord_user) {
                addDiscordBadgesToProfile(userData.discord_user, discordWidget);
            }

            renderDiscordActivity(userData);
        };
    } else {

        updateDiscordStatus('online', { username: 'System' });
    }
    
    // Music is handled by the Now Playing dock (nowPlaying.js), which self-initializes.
});

function updateDiscordStatus(status = 'offline', user = null) {
    const statusDot = document.getElementById('discord-status-dot');
    const statusText = document.getElementById('discord-status-text');
    
    if (!statusDot || !statusText) {
        return;
    }

    const statusConfig = {
        'online': {
            text: 'Online',
            color: 'text-green-400',
            dotClass: 'active',
            dotColor: '#43b581'
        },
        'idle': {
            text: 'Away',
            color: 'text-yellow-400',
            dotClass: 'idle',
            dotColor: '#faa61a'
        },
        'dnd': {
            text: 'Do Not Disturb',
            color: 'text-red-400',
            dotClass: 'dnd',
            dotColor: '#f04747'
        },
        'offline': {
            text: 'Offline',
            color: 'text-gray-400',
            dotClass: 'offline',
            dotColor: '#747f8d'
        }
    };
    
    const config = statusConfig[status] || statusConfig['offline'];
    

    statusText.textContent = config.text;
    statusText.className = `text-xs ${config.color}`;
    

    statusDot.className = `status-dot ${config.dotClass}`;
    statusDot.style.backgroundColor = config.dotColor;
}

window.updateDiscordStatus = updateDiscordStatus;

function applyDiscordDecorationToProfile(decorationData) {
    const profileWrapper = document.querySelector('.profile-image-wrapper');
    
    if (!profileWrapper) {
        return;
    }

    const existingDecoration = profileWrapper.querySelector('.profile-decoration');
    if (existingDecoration) {
        existingDecoration.remove();
    }
    
    if (!decorationData) {
        return;
    }
    
    const decoration = document.createElement('div');
    decoration.className = 'profile-decoration';
    
    let decorationUrl;
    if (decorationData.url) {
        decorationUrl = decorationData.url;
    } else if (decorationData.asset) {
        decorationUrl = `https://cdn.discordapp.com/avatar-decoration-presets/${decorationData.asset}.png?size=160`;
    } else {
        return;
    }
    
    decoration.style.backgroundImage = `url(${decorationUrl})`;
    decoration.style.display = 'block';
    decoration.style.visibility = 'visible';
    decoration.style.opacity = '1';
    
    profileWrapper.appendChild(decoration);
    
    profileWrapper.classList.add('has-decoration');
    
    decoration.offsetHeight;
}

window.applyDiscordDecorationToProfile = applyDiscordDecorationToProfile;

function addDiscordBadgesToProfile(user, discordWidget) {
    const profileName = document.getElementById('profile-name');
    if (!profileName || !discordWidget.showBadges) return;
    
    const existingBadges = profileName.querySelector('.discord-badges');
    if (existingBadges) {
        existingBadges.remove();
    }
    
    const badgesHTML = discordWidget.renderDiscordBadges(user);
    if (badgesHTML) {
        const badgeContainer = document.createElement('span');
        badgeContainer.className = 'discord-badges';
        badgeContainer.innerHTML = badgesHTML;
        
        profileName.appendChild(badgeContainer);
    }
}

window.addDiscordBadgesToProfile = addDiscordBadgesToProfile;

let activityProgressTimer = null;

function resolveActivityAsset(activity) {
    const assets = activity.assets;
    if (!assets || !assets.large_image) return '';
    const img = assets.large_image;

    if (img.startsWith('mp:external/')) {
        return 'https://media.discordapp.net/external/' + img.slice('mp:external/'.length);
    }
    if (img.startsWith('spotify:')) {
        return 'https://i.scdn.co/image/' + img.slice('spotify:'.length);
    }
    if (img.startsWith('mp:')) {
        return 'https://media.discordapp.net/' + img.slice('mp:'.length);
    }
    if (activity.application_id) {
        return `https://cdn.discordapp.com/app-assets/${activity.application_id}/${img}.png`;
    }
    return '';
}

function renderDiscordActivity(userData) {
    const card = document.getElementById('discord-activity');
    if (!card) return;

    const artEl = document.getElementById('activity-art');
    const fallbackEl = card.querySelector('.activity-art-fallback');
    const kindEl = document.getElementById('activity-kind');
    const line1El = document.getElementById('activity-line1');
    const line2El = document.getElementById('activity-line2');
    const progressWrap = document.getElementById('activity-progress');
    const progressBar = document.getElementById('activity-progress-bar');

    if (activityProgressTimer) {
        clearInterval(activityProgressTimer);
        activityProgressTimer = null;
    }
    if (progressWrap) progressWrap.hidden = true;

    const setArt = (url, fallbackIcon) => {
        if (fallbackEl && fallbackIcon) fallbackEl.className = `fab ${fallbackIcon} activity-art-fallback`;
        if (url) {
            artEl.src = url;
            artEl.classList.add('show');
            artEl.onerror = () => artEl.classList.remove('show');
        } else {
            artEl.removeAttribute('src');
            artEl.classList.remove('show');
        }
    };

    const startProgress = (start, end) => {
        if (!start || !end || !progressWrap || !progressBar || end <= start) return;
        progressWrap.hidden = false;
        const tick = () => {
            const now = Date.now();
            const pct = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
            progressBar.style.width = pct + '%';
            if (now >= end && activityProgressTimer) {
                clearInterval(activityProgressTimer);
                activityProgressTimer = null;
            }
        };
        tick();
        activityProgressTimer = setInterval(tick, 1000);
    };

    // 1) Spotify takes priority
    if (userData.listening_to_spotify && userData.spotify) {
        const s = userData.spotify;
        kindEl.textContent = 'Listening on Spotify';
        line1El.textContent = s.song || '';
        line2El.textContent = s.artist ? `by ${s.artist}` : '';
        setArt(s.album_art_url, 'fa-spotify');
        if (s.timestamps) startProgress(s.timestamps.start, s.timestamps.end);
        card.hidden = false;
        return;
    }

    // 2) Other activities (skip custom status, type 4)
    const activities = Array.isArray(userData.activities) ? userData.activities : [];
    const activity = activities.find(a => a.type !== 4);

    if (activity) {
        const typeLabels = { 0: 'Playing', 1: 'Streaming', 2: 'Listening to', 3: 'Watching', 5: 'Competing in' };
        kindEl.textContent = typeLabels[activity.type] || 'Playing';
        line1El.textContent = activity.name || '';
        line2El.textContent = activity.details || activity.state || '';
        setArt(resolveActivityAsset(activity), 'fa-discord');
        if (activity.timestamps) startProgress(activity.timestamps.start, activity.timestamps.end);
        card.hidden = false;
        return;
    }

    // Nothing to show
    card.hidden = true;
}

window.renderDiscordActivity = renderDiscordActivity;

function typewriteText(el, text, speed = 45) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        el.textContent = text;
        return;
    }
    el.textContent = '';
    el.classList.add('typing');
    let i = 0;
    const timer = setInterval(() => {
        el.textContent = text.slice(0, ++i);
        if (i >= text.length) {
            clearInterval(timer);
            setTimeout(() => el.classList.remove('typing'), 1200);
        }
    }, speed);
}

function setupProfile(profile) {

    const nameElement = document.getElementById('profile-name');
    if (nameElement) {
        nameElement.innerHTML = '';
        
        const nameText = document.createElement('span');
        nameText.className = 'profile-name-text';
        nameText.textContent = profile.name;
        nameElement.appendChild(nameText);
        
        if (Array.isArray(profile.badges) && profile.badges.length > 0) {
            const badgesSpan = document.createElement('span');
            badgesSpan.className = 'profile-badges';
            profile.badges.forEach(b => {
                const icon = document.createElement('i');
                icon.className = `${b.icon} profile-badge`;
                icon.style.color = b.color;
                icon.title = b.label;
                badgesSpan.appendChild(icon);
            });
            nameElement.appendChild(badgesSpan);
        }
    }
    

    const descElement = document.getElementById('profile-description');
    if (descElement) {
        if (profile.typewriter && profile.description) {
            typewriteText(descElement, profile.description);
        } else {
            descElement.textContent = profile.description;
        }
    }

    const tagsWrap = document.getElementById('profile-tags');
    if (tagsWrap) {
        tagsWrap.innerHTML = '';
        (profile.tags || []).forEach(tag => {
            const chip = document.createElement('span');
            chip.className = 'profile-tag';
            chip.textContent = tag;
            tagsWrap.appendChild(chip);
        });
    }

    // Profile banner (Premium)
    const bannerWrap = document.getElementById('card-banner');
    const bannerImg = document.getElementById('profile-banner');
    if (bannerWrap && bannerImg) {
        if (profile.banner && /^https?:\/\//i.test(profile.banner)) {
            bannerImg.src = profile.banner;
            bannerWrap.hidden = false;
            bannerImg.onerror = () => { bannerWrap.hidden = true; };
        } else {
            bannerWrap.hidden = true;
        }
    }


    const imgElement = document.querySelector('.profile-image');
    if (imgElement && profile.profileImage) {
        imgElement.src = profile.profileImage;
        imgElement.alt = `${profile.name} Profile`;
    }
    
    document.title = `${profile.name}`;

    const lastfmTitle = document.getElementById('lastfm-title');
    if (lastfmTitle && profile.name) {
        lastfmTitle.textContent = `${profile.name.toUpperCase()} IS LISTENING TO`;
    }
}

function setupSocialLinks(socialMedia) {

    const socialLinks = document.querySelectorAll('[data-social]');
    
    socialLinks.forEach(link => {
        const platform = link.getAttribute('data-social');
        const url = socialMedia[platform];
        
        const safe = url && socialMedia.hasOwnProperty(platform) ? sanitizeHref(url) : '';
        if (safe) {
            link.href = safe;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.style.display = ''; // Show
            
            link.addEventListener('mouseenter', function() {
            });
        } else {
            link.style.display = 'none';
            link.remove(); 
        }
    });
    
    const socialGrid = document.querySelector('.social-grid');
    if (socialGrid) {
        const visibleLinks = socialGrid.querySelectorAll('.social-icon:not([style*="display: none"])');

        socialGrid.className = `social-grid icons-${visibleLinks.length}`;
    }
}

// Defense-in-depth: never put a dangerous scheme into an href (server also enforces).
function sanitizeHref(u) {
    const s = String(u || '').trim();
    if (/^\s*(javascript|data|vbscript):/i.test(s)) return '';
    return s;
}

function renderCustomLinks(links) {
    const wrap = document.getElementById('custom-links');
    if (!wrap) return;
    wrap.innerHTML = '';
    (Array.isArray(links) ? links : []).forEach(l => {
        if (!l || !l.url) return;
        const href = sanitizeHref(l.url);
        if (!href) return;
        const a = document.createElement('a');
        a.className = 'custom-link';
        a.href = href;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = l.label || l.url;
        wrap.appendChild(a);
    });
}

function applyBranding(removeBranding) {
    const credit = document.getElementById('lumen-credit');
    if (credit) credit.hidden = !!removeBranding;
}

function setupLocationRotation(locationConfig) {
    const locationElement = document.querySelector('.location-text');
    
    if (!locationConfig.enabled || !locationElement || !locationConfig.list || !locationConfig.list.length) {
        const locationRow = locationElement?.closest('.status-row');
        if (locationRow) {
            locationRow.style.display = 'none';
        }
        return;
    }
    
    let currentIndex = 0;
    
    function updateLocation() {
        locationElement.textContent = locationConfig.list[currentIndex];
        currentIndex = (currentIndex + 1) % locationConfig.list.length;
    }
    
    updateLocation();
    
    if (locationConfig.list.length > 1) {
        setInterval(updateLocation, locationConfig.interval);
    }
}

window.updateConfig = function(newConfig) {
    window.siteConfig = { ...window.siteConfig, ...newConfig };
    
    setupProfile(window.siteConfig.profile);
    setupSocialLinks(window.siteConfig.socialMedia);
};

async function initializeLastFmWidget(lastfmConfig) {
    const fab = document.getElementById('lastfm-fab');
    const panel = document.getElementById('scrobble-panel');
    const overlay = document.getElementById('scrobble-overlay');
    const closeBtn = document.getElementById('scrobble-close');
    const list = document.getElementById('scrobble-list');
    const heading = document.getElementById('scrobble-heading');
    const eqFab = document.getElementById('lastfm-eq-fab');
    const eqPanel = document.getElementById('lastfm-eq');

    if (!fab || !panel) return;

    const apiKey = window.siteConfig?.lastfm?.apiKey || '';
    if (!apiKey || !lastfmConfig.username) return;

    const lastFmService = new LastFmService(apiKey, lastfmConfig.username);

    // Show the FAB
    fab.hidden = false;

    // Last.fm returns this star image when a track has no real album art.
    const LASTFM_PLACEHOLDER = '2a96cbd8b46e442fc41c2b86b821562f';

    function getAlbumArt(track) {
        if (!Array.isArray(track.image)) return '';
        for (let i = track.image.length - 1; i >= 0; i--) {
            const url = track.image[i] && track.image[i]['#text'];
            if (url && !url.includes(LASTFM_PLACEHOLDER)) return url;
        }
        return '';
    }

    function relativeTime(dateStr) {
        if (!dateStr) return 'Now';
        const then = new Date(dateStr * 1000 || dateStr);
        const diff = Math.floor((Date.now() - then.getTime()) / 1000);
        if (diff < 60) return 'Just now';
        if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
        if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
        return Math.floor(diff / 86400) + 'd ago';
    }

    function renderTracks(tracks) {
        list.innerHTML = '';
        if (!tracks.length) {
            list.innerHTML = '<li class="scrobble-empty"><i class="fas fa-compact-disc fa-spin" style="animation-duration: 4s; font-size: 1.4rem; margin-bottom: 8px; opacity: 0.5; display: block;"></i> No recent scrobbles found.<br><span style="font-size: 0.72rem; opacity: 0.6;">Time to spin some tracks!</span></li>';
            return;
        }

        let isNowPlaying = false;
        tracks.forEach(t => {
            const np = t['@attr']?.nowplaying === 'true';
            if (np) isNowPlaying = true;
            const name = t.name || 'Unknown';
            const artist = t.artist?.['#text'] || t.artist || '';
            const art = getAlbumArt(t);
            const time = np ? 'Now' : relativeTime(t.date?.uts);

            const li = document.createElement('li');
            li.className = 'scrobble-item' + (np ? ' now-playing' : '');
            li.innerHTML =
                '<div class="scrobble-art">' +
                    '<img alt="" loading="lazy">' +
                    '<i class="fas fa-music scrobble-art-fallback" aria-hidden="true"></i>' +
                '</div>' +
                '<div class="scrobble-meta">' +
                    '<div class="scrobble-track"></div>' +
                    '<div class="scrobble-artist"></div>' +
                '</div>' +
                '<span class="scrobble-time"></span>';

            li.querySelector('.scrobble-track').textContent = name;
            li.querySelector('.scrobble-artist').textContent = artist;
            li.querySelector('.scrobble-time').textContent = time;

            const img = li.querySelector('.scrobble-art img');
            if (art) {
                img.src = art;
                img.classList.add('show');
                img.onerror = () => img.classList.remove('show');
            }

            list.appendChild(li);
        });

        // Update eq indicators
        if (eqFab) eqFab.classList.toggle('playing', isNowPlaying);
        if (eqPanel) eqPanel.classList.toggle('playing', isNowPlaying);
    }

    let panelOpen = false;
    let loaded = false;

    function openPanel() {
        panelOpen = true;
        panel.hidden = false;
        overlay.hidden = false;
        // Trigger reflow then animate
        panel.offsetHeight;
        panel.classList.add('open');
        overlay.classList.add('open');
        fab.style.opacity = '0';
        fab.style.pointerEvents = 'none';
        if (!loaded) fetchTracks();
    }

    function closePanel() {
        panelOpen = false;
        panel.classList.remove('open');
        overlay.classList.remove('open');
        fab.style.opacity = '';
        fab.style.pointerEvents = '';
        setTimeout(() => {
            if (!panelOpen) {
                panel.hidden = true;
                overlay.hidden = true;
            }
        }, 350);
    }

    async function fetchTracks() {
        loaded = true;
        list.innerHTML = '<li class="scrobble-loading"><i class="fas fa-spinner fa-spin"></i> Loading…</li>';
        const tracks = await lastFmService.getRecentTracks(25);
        renderTracks(tracks);
    }

    fab.addEventListener('click', openPanel);
    closeBtn.addEventListener('click', closePanel);
    overlay.addEventListener('click', closePanel);

    // Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && panelOpen) closePanel();
    });

    // Set heading text using profile name
    const profileName = window.siteConfig?.profile?.name;
    if (heading && profileName) {
        heading.textContent = profileName.toUpperCase() + "'S SCROBBLES";
    }

    // Initial check: show now-playing indicator on the FAB immediately
    const current = await lastFmService.getCurrentTrack();
    if (current) {
        const np = current['@attr']?.nowplaying === 'true';
        if (eqFab) eqFab.classList.toggle('playing', np);
    }

    // Auto-refresh when panel is open
    setInterval(async () => {
        if (panelOpen) {
            const tracks = await lastFmService.getRecentTracks(25);
            renderTracks(tracks);
        } else {
            // Just check now-playing status for the FAB indicator
            const current = await lastFmService.getCurrentTrack();
            if (current && eqFab) {
                eqFab.classList.toggle('playing', current['@attr']?.nowplaying === 'true');
            }
        }
    }, 60000);
}
