document.addEventListener('DOMContentLoaded', async () => {
    const config = window.siteConfig?.integrations;
    if (!config) return;

    const grid = document.getElementById('integrations-grid');
    if (!grid) return;

    // Steam Status (via decapi)
    if (config.steam?.enabled && config.steam.steamId) {
        const wrap = document.createElement('div');
        wrap.className = 'integration-card steam-card';
        wrap.innerHTML = `
            <div class="integration-icon"><i class="fab fa-steam"></i></div>
            <div class="integration-info">
                <div class="integration-label">Steam Status</div>
                <div class="integration-value" id="steam-status">Loading...</div>
            </div>
        `;
        grid.appendChild(wrap);

        try {
            const res = await fetch(`https://decapi.me/steam/status/${config.steam.steamId}`);
            if (res.ok) {
                const text = await res.text();
                document.getElementById('steam-status').textContent = text;
            } else {
                document.getElementById('steam-status').textContent = 'Error';
            }
        } catch (e) {
            document.getElementById('steam-status').textContent = 'Error';
        }
    }

    // Twitch Status (via decapi)
    if (config.twitch?.enabled && config.twitch.username) {
        const wrap = document.createElement('div');
        wrap.className = 'integration-card twitch-card';
        wrap.innerHTML = `
            <div class="integration-icon"><i class="fab fa-twitch"></i></div>
            <div class="integration-info">
                <div class="integration-label">Twitch</div>
                <div class="integration-value" id="twitch-status">Checking...</div>
            </div>
        `;
        grid.appendChild(wrap);

        try {
            const res = await fetch(`https://decapi.me/twitch/uptime/${config.twitch.username}`);
            if (res.ok) {
                const text = await res.text();
                const statusEl = document.getElementById('twitch-status');
                if (text.includes('Offline')) {
                    statusEl.textContent = 'Offline';
                    statusEl.classList.add('offline');
                } else {
                    const titleRes = await fetch(`https://decapi.me/twitch/title/${config.twitch.username}`);
                    const titleText = await titleRes.text();
                    statusEl.innerHTML = `<span class="live-dot"></span> Live: ${titleText}`;
                    statusEl.classList.add('live');
                }
            }
        } catch (e) {
            document.getElementById('twitch-status').textContent = 'Error';
        }
    }

    // Local Weather
    if (config.weather?.enabled && config.weather.location) {
        const wrap = document.createElement('div');
        wrap.className = 'integration-card weather-card';
        wrap.innerHTML = `
            <div class="integration-icon" id="weather-icon"><i class="fas fa-cloud"></i></div>
            <div class="integration-info">
                <div class="integration-label">Weather in ${config.weather.location}</div>
                <div class="integration-value" id="weather-status">Loading...</div>
            </div>
        `;
        grid.appendChild(wrap);

        try {
            // Geocode
            const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(config.weather.location)}&count=1&language=en&format=json`);
            const geoData = await geoRes.json();
            if (geoData.results && geoData.results.length > 0) {
                const loc = geoData.results[0];
                const wRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current_weather=true`);
                const wData = await wRes.json();
                if (wData.current_weather) {
                    const temp = Math.round(wData.current_weather.temperature);
                    const isDay = wData.current_weather.is_day;
                    const code = wData.current_weather.weathercode;
                    
                    let icon = 'fa-cloud';
                    if (code === 0) icon = isDay ? 'fa-sun' : 'fa-moon';
                    else if (code <= 3) icon = isDay ? 'fa-cloud-sun' : 'fa-cloud-moon';
                    else if (code <= 48) icon = 'fa-smog';
                    else if (code <= 67) icon = 'fa-cloud-rain';
                    else if (code <= 77) icon = 'fa-snowflake';
                    else if (code <= 82) icon = 'fa-cloud-showers-heavy';
                    else if (code <= 99) icon = 'fa-cloud-bolt';

                    document.getElementById('weather-status').textContent = `${temp}°C`;
                    document.getElementById('weather-icon').innerHTML = `<i class="fas ${icon}"></i>`;
                }
            } else {
                document.getElementById('weather-status').textContent = 'Location not found';
            }
        } catch (e) {
            document.getElementById('weather-status').textContent = 'Error';
        }
    }

    // Premium GitHub Card
    if (config.github?.enabled && config.github.username) {
        const wrapDesktop = document.createElement('div');
        wrapDesktop.className = 'integration-card github-card floating-github';
        document.body.appendChild(wrapDesktop);

        const wrapMobile = document.createElement('div');
        wrapMobile.className = 'integration-card github-card inline-github';
        grid.appendChild(wrapMobile);

        const renderGh = (html) => {
            wrapDesktop.innerHTML = html;
            wrapMobile.innerHTML = html;
        };

        renderGh(`
            <div class="github-header">
                <i class="fab fa-github"></i> GitHub Profile
            </div>
            <div style="padding: 1rem; text-align: center; color: #8b949e;">Loading profile...</div>
        `);

        fetch(`https://api.github.com/users/${config.github.username}`)
            .then(res => {
                if (!res.ok) throw new Error('Not found');
                return res.json();
            })
            .then(data => {
                const name = data.name || data.login;
                const bio = data.bio ? `<div class="gh-bio">${data.bio}</div>` : '';
                
                const html = `
                    <div class="gh-profile-card">
                        <div class="gh-top">
                            <img src="${data.avatar_url}" class="gh-avatar" alt="avatar">
                            <div class="gh-info">
                                <div class="gh-name">${name}</div>
                                <div class="gh-user">@${data.login}</div>
                            </div>
                            <a href="${data.html_url}" target="_blank" class="gh-follow-btn">View</a>
                        </div>
                        ${bio}
                        <div class="gh-stats">
                            <div class="gh-stat">
                                <span class="gh-stat-value">${data.public_repos}</span>
                                <span class="gh-stat-label">Repos</span>
                            </div>
                            <div class="gh-stat">
                                <span class="gh-stat-value">${data.followers}</span>
                                <span class="gh-stat-label">Followers</span>
                            </div>
                            <div class="gh-stat">
                                <span class="gh-stat-value">${data.following}</span>
                                <span class="gh-stat-label">Following</span>
                            </div>
                        </div>
                    </div>
                `;
                renderGh(html);
            })
            .catch(err => {
                renderGh(`
                    <div class="github-header">
                        <i class="fab fa-github"></i> GitHub Profile
                    </div>
                    <div style="padding: 1rem; text-align: center; color: #fca5a5;">Failed to load</div>
                `);
            });
    }
});
