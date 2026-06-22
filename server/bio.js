/**
 * Bio config API — read/update the signed-in user's bio, read any public bio.
 */
const express = require('express');
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { put } = require('@vercel/blob');
const store = require('./store');
const defaultConfig = require('./defaultConfig');
const analytics = require('./analytics');
const rateLimit = require('./rateLimit');
const { authRequired } = require('./auth');

const router = express.Router();

// Generous per-IP cap on the public click beacon — a real visitor won't hit it,
// but it blunts scripted attempts to inflate counts / hammer the KV store.
const clickLimiter = rateLimit({ name: 'click', windowMs: 60 * 1000, max: 120, message: 'Slow down.' });
const guestbookLimiter = rateLimit({ name: 'guestbook', windowMs: 60 * 1000, max: 5, message: 'Spam protection: please wait a minute before posting again.' });

const ALLOWED_AUDIO = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/flac'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    ALLOWED_AUDIO.includes(file.mimetype) ? cb(null, true) : cb(new Error('Only audio files are allowed (mp3, wav, ogg, m4a, flac)'))
});

const ALLOWED_IMAGE = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/avif'];

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    ALLOWED_IMAGE.includes(file.mimetype) ? cb(null, true) : cb(new Error('Only image files are allowed (PNG, JPG, WEBP, GIF).'))
});

router.post('/songs', authRequired, upload.single('song'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  try {
    const original = req.file.originalname || '';
    const title = original.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Track';
    const ext = path.extname(original).toLowerCase().replace(/[^.a-z0-9]/g, '');
    const base = path.basename(original, path.extname(original))
      .toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'track';
    const uid = (req.user && req.user.id ? req.user.id : 'u').slice(0, 8);
    const filename = `${uid}-${Date.now()}-${base}${ext}`;

    const blob = await put(filename, req.file.buffer, {
      access: 'public',
      contentType: req.file.mimetype,
    });

    res.json({ success: true, url: blob.url, title });
  } catch (e) {
    console.error('Blob upload error:', e);
    res.status(500).json({ error: 'Failed to upload song.' });
  }
});

router.post('/image', authRequired, imageUpload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  try {
    const kind = req.body && req.body.kind === 'banner' ? 'banner' : 'avatar';
    const ext = path.extname(req.file.originalname || '').toLowerCase().replace(/[^.a-z0-9]/g, '') ||
      ('.' + ((req.file.mimetype.split('/')[1] || 'png').replace('jpeg', 'jpg')));
    const uid = (req.user && req.user.id ? req.user.id : 'u').slice(0, 8);
    const filename = `${uid}-${kind}-${Date.now()}${ext}`;
    const blob = await put(filename, req.file.buffer, { access: 'public', contentType: req.file.mimetype });
    res.json({ success: true, url: blob.url });
  } catch (e) {
    console.error('Image upload error:', e);
    res.status(500).json({ error: 'Failed to upload image.' });
  }
});

const MAX_CONFIG_BYTES = 64 * 1024;

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

// Only allow http(s) links; reject javascript:/data:/etc., assume https for scheme-less.
function safeUrl(u) {
  u = String(u || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u.slice(0, 400);
  if (/^[a-z][a-z0-9+.\-]*:/i.test(u)) return ''; // disallow other schemes
  return ('https://' + u).slice(0, 400);
}

function normalizeDomain(d) {
  d = String(d || '').trim().toLowerCase();
  if (!d) return '';
  d = d.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '');
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) return '';
  return d.slice(0, 100);
}

function isPayhipUrl(u) {
  try {
    const url = new URL(u);
    return url.hostname === 'payhip.com' || url.hostname.endsWith('.payhip.com');
  } catch (e) {
    return false;
  }
}

function isBuymeacoffeeUrl(u) {
  try {
    const url = new URL(u);
    return url.hostname === 'buymeacoffee.com' || url.hostname.endsWith('.buymeacoffee.com');
  } catch (e) {
    return false;
  }
}

function isKofiUrl(u) {
  try {
    const url = new URL(u);
    return url.hostname === 'ko-fi.com' || url.hostname.endsWith('.ko-fi.com');
  } catch (e) {
    return false;
  }
}

function isPatreonUrl(u) {
  try {
    const url = new URL(u);
    return url.hostname === 'patreon.com' || url.hostname.endsWith('.patreon.com');
  } catch (e) {
    return false;
  }
}

function publicConfig(config) {
  const c = JSON.parse(JSON.stringify(config || {}));
  const enabled = !!(c.passwordProtect && c.passwordProtect.enabled && c.passwordProtect.hash);
  c.passwordProtect = { enabled, hasPassword: !!(config.passwordProtect && config.passwordProtect.hash) };
  return c;
}

function mergeConfig(template, incoming) {
  if (!isPlainObject(incoming)) return template;
  const out = Array.isArray(template) ? [] : {};
  for (const key of Object.keys(template)) {
    const t = template[key];
    const i = incoming[key];
    if (isPlainObject(t)) {
      out[key] = mergeConfig(t, isPlainObject(i) ? i : {});
    } else if (Array.isArray(t)) {
      out[key] = Array.isArray(i) ? i.slice(0, 50) : t;
    } else if (i !== undefined && i !== null && typeof i !== 'object') {
      out[key] = typeof t === 'string' ? String(i).slice(0, 2000) : i;
    } else {
      out[key] = t;
    }
  }
  return out;
}

router.get('/', authRequired, async (req, res) => {
  const u = await store.findById(req.user.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  res.json({ username: u.username, config: publicConfig(u.config), views: u.views || 0, premium: !!u.premium });
});

router.get('/analytics', authRequired, async (req, res) => {
  const u = await store.findById(req.user.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  if (!u.premium) return res.json({ premium: false, data: null });
  res.json({ premium: true, data: await analytics.get(u.username) });
});

router.put('/', authRequired, async (req, res) => {
  const u = await store.findById(req.user.id);
  if (!u) return res.status(404).json({ error: 'User not found' });

  const incoming = req.body && req.body.config;
  if (!isPlainObject(incoming)) return res.status(400).json({ error: 'Invalid config payload.' });
  if (JSON.stringify(incoming).length > MAX_CONFIG_BYTES) {
    return res.status(413).json({ error: 'Config is too large.' });
  }

  const merged = mergeConfig(defaultConfig(u.username), incoming);

  if (isPlainObject(merged.socialMedia)) {
    for (const k of Object.keys(merged.socialMedia)) {
      if (merged.socialMedia[k]) {
        const url = safeUrl(merged.socialMedia[k]);
        if (k === 'payhip' && !isPayhipUrl(url)) {
          merged.socialMedia[k] = '';
        } else if (k === 'buymeacoffee' && !isBuymeacoffeeUrl(url)) {
          merged.socialMedia[k] = '';
        } else if (k === 'kofi' && !isKofiUrl(url)) {
          merged.socialMedia[k] = '';
        } else if (k === 'patreon' && !isPatreonUrl(url)) {
          merged.socialMedia[k] = '';
        } else {
          merged.socialMedia[k] = url;
        }
      }
    }
  }

  if (!u.premium) {
    merged.customLinks = [];
    merged.removeBranding = false;
    merged.customCss = '';
    merged.customDomain = '';
    merged.passwordProtect = { enabled: false, hash: '' };
    merged.profile.banner = '';
    merged.theme.effects.cursor = '';
    if (merged.theme.background.type === 'video') merged.theme.background.type = 'image';
    merged.theme.background.video = '';
  } else {
    merged.customLinks = (Array.isArray(merged.customLinks) ? merged.customLinks : [])
      .filter(l => l && (l.label || l.url))
      .slice(0, 20)
      .map(l => ({ label: String(l.label || '').slice(0, 60), url: safeUrl(l.url) }))
      .filter(l => l.url);
    merged.customCss = String(merged.customCss || '').slice(0, 20000);
    merged.customDomain = normalizeDomain(merged.customDomain);
    merged.profile.banner = safeUrl(merged.profile.banner);
    merged.theme.effects.cursor = safeUrl(merged.theme.effects.cursor);
    merged.theme.background.video = safeUrl(merged.theme.background.video);

    const incomingPP = isPlainObject(incoming.passwordProtect) ? incoming.passwordProtect : {};
    const existingHash = (u.config.passwordProtect && u.config.passwordProtect.hash) || '';
    let hash = existingHash;
    if (incomingPP.password) hash = bcrypt.hashSync(String(incomingPP.password).slice(0, 200), 10);
    const wantEnabled = !!(merged.passwordProtect && merged.passwordProtect.enabled);
    merged.passwordProtect = { enabled: wantEnabled && !!hash, hash };
  }

  await store.setConfig(u.id, merged);
  res.json({ success: true, config: publicConfig(merged) });
});

// Public link-click beacon (fired by clickTracker.js on the bio page).
router.post('/:username/click', clickLimiter, async (req, res) => {
  try {
    const u = await store.findByUsername(req.params.username);
    if (u) {
      const label = String((req.body && req.body.label) || '').slice(0, 80);
      if (label) await analytics.recordClick(u.username, label);
    }
  } catch (e) { /* best-effort */ }
  res.status(204).end();
});

router.post('/:username/unlock', async (req, res) => {
  const u = await store.findByUsername(req.params.username);
  if (!u || !u.config.passwordProtect || !u.config.passwordProtect.hash) {
    return res.status(400).json({ error: 'This page is not protected.' });
  }
  const ok = bcrypt.compareSync(String(req.body.password || ''), u.config.passwordProtect.hash);
  if (!ok) return res.status(401).json({ error: 'Incorrect password.' });
  const { unlockToken } = require('./secret');
  const token = await unlockToken(u.username);
  res.cookie('lu_' + u.username, token, {
    httpOnly: true, sameSite: 'lax', maxAge: 12 * 60 * 60 * 1000
  });
  res.json({ success: true });
});

async function getProfileBadges(user) {
  const badges = [];
  const isAdmin = await store.isAdmin(user);
  if (isAdmin) {
    badges.push({ type: 'owner', icon: 'fas fa-crown', label: 'Owner', color: '#ffd700' });
  }
  if (user.verified || ['joaosw', 'joao'].includes(user.username)) {
    badges.push({ type: 'verified', icon: 'fas fa-circle-check', label: 'Verified', color: 'var(--accent)' });
  }
  if (user.premium) {
    badges.push({ type: 'premium', icon: 'fas fa-gem', label: 'Premium', color: '#ff4a7d' });
  }
  return badges;
}

router.get('/leaderboard', async (req, res) => {
  try {
    const users = await store.all();
    const topUsers = await Promise.all(users.map(async u => ({
      username: u.username,
      name: (u.config && u.config.profile && u.config.profile.name) || u.username,
      description: (u.config && u.config.profile && u.config.profile.description) || '',
      profileImage: (u.config && u.config.profile && u.config.profile.profileImage) || '',
      views: u.views || 0,
      premium: !!u.premium,
      badges: await getProfileBadges(u)
    })));
    topUsers.sort((a, b) => b.views - a.views);
    res.json({ success: true, leaderboard: topUsers.slice(0, 25) });
  } catch (e) {
    console.error('Leaderboard fetch error:', e);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

router.get('/:username/guestbook', async (req, res) => {
  try {
    const user = await store.findByUsername(req.params.username);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const isGuestbookEnabled = !!(user.config && user.config.guestbook && user.config.guestbook.enabled);
    if (!isGuestbookEnabled) {
      return res.status(400).json({ error: 'Guestbook is not enabled on this profile.' });
    }
    const messages = await store.getGuestbookMessages(user.username);
    res.json({ success: true, messages });
  } catch (e) {
    console.error('Guestbook fetch error:', e);
    res.status(500).json({ error: 'Failed to fetch guestbook messages' });
  }
});

router.post('/:username/guestbook', guestbookLimiter, async (req, res) => {
  try {
    const user = await store.findByUsername(req.params.username);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const gbConfig = (user.config && user.config.guestbook) || {};
    if (!gbConfig.enabled) {
      return res.status(400).json({ error: 'Guestbook is not enabled on this profile.' });
    }

    let name = String(req.body.name || '').trim();
    const message = String(req.body.message || '').trim();

    if (!message) {
      return res.status(400).json({ error: 'Message cannot be empty.' });
    }
    if (message.length > 500) {
      return res.status(400).json({ error: 'Message cannot exceed 500 characters.' });
    }

    if (!name) {
      if (!gbConfig.allowAnonymous) {
        return res.status(400).json({ error: 'Anonymous messages are not allowed on this guestbook.' });
      }
      name = 'Anonymous';
    } else if (name.length > 30) {
      return res.status(400).json({ error: 'Name cannot exceed 30 characters.' });
    }

    const cleanName = name.replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const cleanMessage = message.replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const msgId = Math.random().toString(36).substring(2, 11);
    
    const msg = {
      id: msgId,
      name: cleanName,
      message: cleanMessage,
      timestamp: new Date().toISOString()
    };

    const messages = await store.addGuestbookMessage(user.username, msg);
    res.json({ success: true, messages });
  } catch (e) {
    console.error('Guestbook post error:', e);
    res.status(500).json({ error: 'Failed to post guestbook message' });
  }
});

router.delete('/:username/guestbook/:id', authRequired, async (req, res) => {
  try {
    const user = await store.findByUsername(req.params.username);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    if (user.id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized: You do not own this profile.' });
    }

    const id = req.params.id;
    const ok = await store.deleteGuestbookMessage(user.username, id);
    if (!ok) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    res.json({ success: true });
  } catch (e) {
    console.error('Guestbook delete error:', e);
    res.status(500).json({ error: 'Failed to delete guestbook message' });
  }
});

router.post('/:username/guestbook/:id/like', async (req, res) => {
  try {
    const user = await store.findByUsername(req.params.username);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const gbConfig = (user.config && user.config.guestbook) || {};
    if (!gbConfig.enabled) {
      return res.status(400).json({ error: 'Guestbook is not enabled on this profile.' });
    }

    const id = req.params.id;
    const likes = await store.likeGuestbookMessage(user.username, id);
    if (likes === null) {
      return res.status(404).json({ error: 'Message not found' });
    }

    res.json({ success: true, likes });
  } catch (e) {
    console.error('Guestbook like error:', e);
    res.status(500).json({ error: 'Failed to like guestbook message' });
  }
});

router.get('/:username', async (req, res) => {
  const u = await store.findByUsername(req.params.username);
  if (!u) return res.status(404).json({ error: 'Not found' });
  const cfg = publicConfig(u.config);
  cfg.profile.badges = await getProfileBadges(u);
  res.json({ username: u.username, config: cfg, views: u.views || 0 });
});

// Surface upload errors (file too large, wrong type) as clean JSON.
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || /file|image|audio|allowed/i.test(err.message || '')) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large.' : (err.message || 'Upload failed.');
    return res.status(400).json({ error: msg });
  }
  next(err);
});

module.exports = { router, mergeConfig, publicConfig, getProfileBadges };
