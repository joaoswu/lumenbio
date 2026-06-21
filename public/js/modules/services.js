// Enhanced Last.fm integration with real API
class LastFmService {
    constructor(apiKey, username) {
        this.apiKey = apiKey;
        this.username = username;
        this.baseUrl = 'https://ws.audioscrobbler.com/2.0/';
    }

    async getCurrentTrack() {
        // Try to get from 25-tracks cache first to save requests
        const cacheKey = `lastfm_tracks_${this.username}_25`;
        const cacheTimeKey = `${cacheKey}_time`;
        try {
            const cachedData = localStorage.getItem(cacheKey);
            const cachedTime = localStorage.getItem(cacheTimeKey);
            if (cachedData && cachedTime && (Date.now() - parseInt(cachedTime, 10) < 60000)) {
                const tracks = JSON.parse(cachedData);
                if (tracks && tracks.length > 0) {
                    return tracks[0];
                }
            }
        } catch (e) {}

        // Fallback to individual current track cache (30s)
        const currentKey = `lastfm_current_${this.username}`;
        const currentTimeKey = `${currentKey}_time`;
        try {
            const cachedData = localStorage.getItem(currentKey);
            const cachedTime = localStorage.getItem(currentTimeKey);
            if (cachedData && cachedTime && (Date.now() - parseInt(cachedTime, 10) < 30000)) {
                return JSON.parse(cachedData);
            }
        } catch (e) {}

        try {
            const response = await fetch(
                `${this.baseUrl}?method=user.getrecenttracks&user=${this.username}&api_key=${this.apiKey}&format=json&limit=1`
            );
            const data = await response.json();
            const track = data.recenttracks?.track?.[0] || null;
            try {
                localStorage.setItem(currentKey, JSON.stringify(track));
                localStorage.setItem(currentTimeKey, Date.now().toString());
            } catch (e) {}
            return track;
        } catch (error) {
            console.error('Last.fm API error:', error);
            return null;
        }
    }

    async getRecentTracks(limit = 25) {
        const cacheKey = `lastfm_tracks_${this.username}_${limit}`;
        const cacheTimeKey = `${cacheKey}_time`;
        
        try {
            const cachedData = localStorage.getItem(cacheKey);
            const cachedTime = localStorage.getItem(cacheTimeKey);
            if (cachedData && cachedTime && (Date.now() - parseInt(cachedTime, 10) < 60000)) {
                return JSON.parse(cachedData);
            }
        } catch (e) {}

        try {
            const response = await fetch(
                `${this.baseUrl}?method=user.getrecenttracks&user=${this.username}&api_key=${this.apiKey}&format=json&limit=${limit}`
            );
            const data = await response.json();
            const tracks = data.recenttracks?.track || [];
            try {
                localStorage.setItem(cacheKey, JSON.stringify(tracks));
                localStorage.setItem(cacheTimeKey, Date.now().toString());
            } catch (e) {}
            return tracks;
        } catch (error) {
            console.error('Last.fm API error:', error);
            return [];
        }
    }
}

window.LastFmService = LastFmService;

