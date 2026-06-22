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

    // GitHub Stats
    if (config.github?.enabled && config.github.username) {
        // Fix up the color variable replacement
        const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim();
        let hexColor = '8b5cf6';
        if (primaryColor.startsWith('#')) {
            hexColor = primaryColor.replace('#', '');
        } else if (primaryColor.startsWith('rgb')) {
            hexColor = '8b5cf6'; 
        }

        const htmlContent = `
            <div class="github-header">
                <i class="fab fa-github"></i> GitHub Contributions
            </div>
            <img class="github-chart" src="https://ghchart.rshah.org/${hexColor}/${config.github.username}" alt="${config.github.username}'s Github chart" />
        `;

        // Desktop Floating Version (appended to body to escape CSS stacking context)
        const wrapDesktop = document.createElement('div');
        wrapDesktop.className = 'integration-card github-card floating-github';
        wrapDesktop.innerHTML = htmlContent;
        document.body.appendChild(wrapDesktop);

        // Mobile Inline Version (appended to normal grid)
        const wrapMobile = document.createElement('div');
        wrapMobile.className = 'integration-card github-card inline-github';
        wrapMobile.innerHTML = htmlContent;
        grid.appendChild(wrapMobile);
    }
});
