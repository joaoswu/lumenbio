/**
 * Starter bio config for a freshly created Lumenbio account.
 * Matches the shape the front-end bio engine expects (window.siteConfig).
 */
module.exports = function defaultConfig(username, displayName) {
  const name = displayName || username;
  return {
    profile: {
      name,
      description: 'Welcome to my Lumenbio page ✨',
      timezone: 'America/New_York',
      profileImage: '',
      profileImageType: '',
      banner: '',
      tags: [],
      typewriter: false
    },
    socialMedia: {
      github: '', twitter: '', lastfm: '', osu: '', vrchat: '',
      steam: '', instagram: '', tiktok: '', namemc: '', youtube: ''
    },
    locations: { enabled: false, interval: 10000, list: [] },
    lastfm: { enabled: false, username: '', apiKey: '' },
    discord: { enabled: false, userId: '', updateInterval: 5000, useWebSocket: true, showBadges: true },
    musicPlayer: { enabled: false, volume: 50, autoplay: false, tracks: [] },
    integrations: {
      github: { enabled: false, username: '' },
      twitch: { enabled: false, username: '' },
      weather: { enabled: false, location: '' },
      steam: { enabled: false, steamId: '' }
    },
    features: { viewCounter: true },
    customLinks: [],
    removeBranding: false,
    customCss: '',
    customDomain: '',
    passwordProtect: { enabled: false, hash: '' },
    theme: {
      accentColor: '#8b5cf6',
      background: { type: 'image', video: '', image: '', blur: '20px', opacity: 0.3 },
      particles: { enabled: true, count: 60, speed: 0.8, linked: false, color: '#8b5cf6' },
      effects: {
        bloom: { enabled: true, strength: 1, radius: 18, textShadowColor: 'var(--color-primary)', pulseAnimation: true },
        backgroundBlur: 20,
        tilt: true,
        cursor: '',
        locationRotation: { interval: 10000, fadeTransition: true, fadeTime: 10 }
      }
    },
    welcomeScreen: { enabled: true, text: 'Welcome 👋' },
    font: { family: 'Poppins', weights: '300;400;500;600;700' },
    footer: { text: `${name} · made with Lumenbio` }
  };
};
