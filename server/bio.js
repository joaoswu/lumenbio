/**
 * Bio config API — read/update the signed-in user's bio, read any public bio.
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const store = require('./store');
const defaultConfig = require('./defaultConfig');
const analytics = require('./analytics');
const { unlockToken } = require('./secret');
const { authRequired } = require('./auth');

const router = express.Router();

// ---- Per-user song uploads ----
const SONGS_DIR = path.join(__dirname, '..', 'public', 'assets', 'usersongs');
if (!fs.existsSync(SONGS_DIR)) fs.mkdirSync(SONGS_DIR, { recursive: true });

const ALLOWED_AUDIO = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/flac'];

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, SONGS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '');
      const base = path.basename(file.originalname, path.extname(file.originalname))
        .toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'track';
      const uid = (req.user && req.user.id ? req.user.id : 'u').slice(0, 8);
      cb(null, `${uid}-${Date.now()}-${base}${ext}`);
    }
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    ALLOWED_AUDIO.includes(file.mimetype) ? cb(null, true) : cb(new Error('Only audio files are allowed (mp3, wav, ogg, m4a, flac)'))
});

router.post('/songs', authRequired, (req, res) => {
  upload.single('song')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const original = req.file.originalname || '';
    const title = original.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Track';
    res.json({ success: true, url: `assets/usersongs/${req.file.filename}`, title });
  });
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

// Never expose the page-password hash to clients (rendered config is public).
function publicConfig(config) {
  const c = JSON.parse(JSON.stringify(config || {}));
  const enabled = !!(c.passwordProtect && c.passwordProtect.enabled && c.passwordProtect.hash);
  c.passwordProtect = { enabled, hasPassword: !!(config.passwordProtect && config.passwordProtect.hash) };
  return c;
}

// Deep-merge an incoming (untrusted) config over a known-good template so the
// stored object always has the expected shape and no surprise keys.
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

router.get('/', authRequired, (req, res) => {
  const u = store.findById(req.user.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  res.json({ username: u.username, config: publicConfig(u.config), views: u.views || 0, premium: !!u.premium });
});

router.get('/analytics', authRequired, (req, res) => {
  const u = store.findById(req.user.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  if (!u.premium) return res.json({ premium: false, data: null });
  res.json({ premium: true, data: analytics.get(u.username) });
});

router.put('/', authRequired, (req, res) => {
  const u = store.findById(req.user.id);
  if (!u) return res.status(404).json({ error: 'User not found' });

  const incoming = req.body && req.body.config;
  if (!isPlainObject(incoming)) return res.status(400).json({ error: 'Invalid config payload.' });
  if (JSON.stringify(incoming).length > MAX_CONFIG_BYTES) {
    return res.status(413).json({ error: 'Config is too large.' });
  }

  const merged = mergeConfig(defaultConfig(u.username), incoming);

  // Sanitize all user-supplied link URLs (rendered as href -> XSS surface).
  if (isPlainObject(merged.socialMedia)) {
    for (const k of Object.keys(merged.socialMedia)) {
      if (merged.socialMedia[k]) merged.socialMedia[k] = safeUrl(merged.socialMedia[k]);
    }
  }

  // Premium-only fields: stripped for free accounts, sanitized for premium.
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

    // Password protection: hash a newly supplied password, else keep the existing hash.
    const incomingPP = isPlainObject(incoming.passwordProtect) ? incoming.passwordProtect : {};
    const existingHash = (u.config.passwordProtect && u.config.passwordProtect.hash) || '';
    let hash = existingHash;
    if (incomingPP.password) hash = bcrypt.hashSync(String(incomingPP.password).slice(0, 200), 10);
    const wantEnabled = !!(merged.passwordProtect && merged.passwordProtect.enabled);
    merged.passwordProtect = { enabled: wantEnabled && !!hash, hash };
  }

  store.setConfig(u.id, merged);
  res.json({ success: true, config: publicConfig(merged) });
});

// Unlock a password-protected bio (sets an HMAC cookie on success).
router.post('/:username/unlock', (req, res) => {
  const u = store.findByUsername(req.params.username);
  if (!u || !u.config.passwordProtect || !u.config.passwordProtect.hash) {
    return res.status(400).json({ error: 'This page is not protected.' });
  }
  const ok = bcrypt.compareSync(String(req.body.password || ''), u.config.passwordProtect.hash);
  if (!ok) return res.status(401).json({ error: 'Incorrect password.' });
  res.cookie('lu_' + u.username, unlockToken(u.username), {
    httpOnly: true, sameSite: 'lax', maxAge: 12 * 60 * 60 * 1000
  });
  res.json({ success: true });
});

router.get('/:username', (req, res) => {
  const u = store.findByUsername(req.params.username);
  if (!u) return res.status(404).json({ error: 'Not found' });
  res.json({ username: u.username, config: publicConfig(u.config), views: u.views || 0 });
});

module.exports = { router, mergeConfig, publicConfig };
