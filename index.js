try { require('dotenv').config(); } catch (e) { /* optional */ }
const express = require('express');
const path = require('path');
const fs = require('fs');
const compression = require('compression');
const cookieParser = require('cookie-parser');

const store = require('./server/store');
const { router: authRouter } = require('./server/auth');
const { router: bioRouter, publicConfig, getProfileBadges } = require('./server/bio');
const { router: adminRouter } = require('./server/admin');
const billing = require('./server/billing');
const analytics = require('./server/analytics');
const { unlockToken } = require('./server/secret');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');

app.disable('x-powered-by'); // don't advertise Express
app.use(compression());

// ---- Security headers ----
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://cdnjs.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
  "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "connect-src 'self' https://api.lanyard.rest wss://api.lanyard.rest https://ws.audioscrobbler.com",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'"
].join('; ');

app.use((req, res, next) => {
  res.set('Content-Security-Policy', CSP);
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.set('Cross-Origin-Opener-Policy', 'same-origin');
  res.set('X-DNS-Prefetch-Control', 'off');
  if (process.env.NODE_ENV === 'production') {
    res.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
});

// Stripe webhook needs the raw body for signature verification (before json parser).
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), billing.webhookHandler);

app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true, limit: '256kb' }));
app.use(cookieParser());

// Long-cache media, revalidate code/styles via ETag.
app.use('/assets', express.static(path.join(PUBLIC, 'assets'), { maxAge: '7d', etag: true }));
app.use(express.static(PUBLIC, { index: false, redirect: false, maxAge: 0, etag: true, lastModified: true }));

// ---- API ----
app.use('/api/auth', authRouter);
app.use('/api/bio', bioRouter);
app.use('/api/admin', adminRouter);
app.use('/api/billing', billing.router);

app.get('/health', async (_req, res) => {
  res.json({ status: 'ok', users: await store.count(), remaining: await store.remaining(), uptime: process.uptime() });
});

// ---- Pages ----
const sendPage = (dir, file = 'index.html') => (_req, res) =>
  res.sendFile(path.join(PUBLIC, dir, file));

// Custom domains (Premium): a mapped domain's "/" serves that user's bio.
app.use(async (req, res, next) => {
  if (req.method !== 'GET' || req.path !== '/') return next();
  const host = (req.hostname || '').toLowerCase();
  if (!host || ['localhost', '127.0.0.1', '0.0.0.0'].includes(host)) return next();
  try {
    const user = await store.findByDomain(host);
    if (user) return await serveBio(user, req, res);
  } catch(e) {
    console.error('Custom domain error', e);
  }
  next();
});

app.get('/', sendPage('landing'));
app.get('/login', sendPage('auth', 'login.html'));
app.get('/signup', sendPage('auth', 'signup.html'));
app.get('/forgot', sendPage('auth', 'forgot.html'));
app.get('/reset', sendPage('auth', 'reset.html'));
app.get('/dashboard', sendPage('dashboard'));
app.get('/leaderboard', sendPage('leaderboard'));
app.get('/admin', sendPage('admin'));
app.get('/billing/success', billing.successHandler);

// ---- Public bio: /u/:username (config injected server-side) ----
const BIO_TEMPLATE = path.join(PUBLIC, 'bio', 'index.html');

function escapeAttr(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function absUrl(u, origin) {
  u = String(u || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (/^\/\//.test(u)) return 'https:' + u;
  if (u.startsWith('/')) return origin + u;
  return '';
}

// Per-user OpenGraph / Twitter tags so shared bio links get a rich preview.
function buildMeta(cfg, username, origin) {
  const profile = cfg.profile || {};
  const name = profile.name || username;
  const title = `${name} (@${username}) · Lumenbio`;
  let desc = String(profile.description || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  desc = desc.slice(0, 160) || `${name}'s Lumenbio page`;
  const url = `${origin}/u/${username}`;
  const img = absUrl(profile.profileImage, origin);
  const accent = (cfg.theme && cfg.theme.accentColor) || '#c4313a';
  const tags = [
    `<title>${escapeAttr(title)}</title>`,
    `<meta name="description" content="${escapeAttr(desc)}">`,
    `<link rel="canonical" href="${escapeAttr(url)}">`,
    `<meta property="og:type" content="profile">`,
    `<meta property="og:site_name" content="Lumenbio">`,
    `<meta property="og:title" content="${escapeAttr(title)}">`,
    `<meta property="og:description" content="${escapeAttr(desc)}">`,
    `<meta property="og:url" content="${escapeAttr(url)}">`,
    `<meta name="twitter:card" content="${img ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${escapeAttr(title)}">`,
    `<meta name="twitter:description" content="${escapeAttr(desc)}">`,
    `<meta name="theme-color" content="${escapeAttr(accent)}">`
  ];
  if (img) {
    tags.push(`<meta property="og:image" content="${escapeAttr(img)}">`);
    tags.push(`<meta name="twitter:image" content="${escapeAttr(img)}">`);
  }
  return tags.join('\n    ');
}

function originOf(req) {
  return (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
}

function renderBio(config, metaHtml) {
  const template = fs.readFileSync(BIO_TEMPLATE, 'utf8');
  // Config -> non-executable JSON block. Escaping "<" prevents "</script>" breakout.
  const json = JSON.stringify(config).replace(/</g, '\\u003c');
  // Custom CSS -> <style> block. Neutralize any "</" so it can't break out of the tag.
  const css = String(config.customCss || '').replace(/<\//g, '<\\/');
  return template
    .replace('<!--__LUMEN_META__-->', metaHtml || '')
    .replace('/*__LUMEN_CONFIG__*/', json)
    .replace('/*__CUSTOM_CSS__*/', css);
}

function passwordGateHtml(username) {
  const safe = String(username).replace(/[<>&"]/g, '');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark">
<title>Protected · Lumenbio</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0809;color:#f3eded;font-family:'Poppins',system-ui,sans-serif}
.card{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:20px;padding:34px 30px;width:90%;max-width:360px;text-align:center;backdrop-filter:blur(16px)}
.lock{width:48px;height:48px;border-radius:50%;display:grid;place-items:center;margin:0 auto 14px;background:linear-gradient(135deg,#c4313a,#6f1119);font-size:1.2rem}
h1{font-size:1.2rem;margin:0 0 4px}p{color:#a59a9c;font-size:.85rem;margin:0 0 20px}
input{width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);border-radius:11px;color:#fff;font-size:.95rem;padding:12px 14px;outline:none;font-family:inherit}
button{width:100%;margin-top:12px;padding:12px;border:0;border-radius:11px;background:linear-gradient(135deg,#c4313a,#9b1d2b);color:#fff;font-weight:600;font-size:.95rem;cursor:pointer;font-family:inherit}
.err{color:#fca5a5;font-size:.8rem;margin-top:10px;min-height:1em}</style></head>
<body><form class="card" id="f"><div class="lock">🔒</div><h1>This page is protected</h1>
<p>Enter the password to view <strong>${safe}</strong></p>
<input type="password" id="pw" placeholder="Password" autofocus autocomplete="current-password">
<button type="submit">Unlock</button><div class="err" id="e"></div></form>
<script>document.getElementById('f').addEventListener('submit',async function(ev){ev.preventDefault();
var e=document.getElementById('e');e.textContent='';
try{var r=await fetch('/api/bio/${safe}/unlock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:document.getElementById('pw').value})});
var d=await r.json();if(!r.ok||!d.success)throw new Error(d.error||'Wrong password');location.reload();}catch(err){e.textContent=err.message;}});</script>
</body></html>`;
}

async function serveBio(user, req, res) {
  const pp = user.config.passwordProtect;
  const isPreview = !!req.query.preview;

  if (pp && pp.enabled && pp.hash && !isPreview) {
    const cookie = req.cookies && req.cookies['lu_' + user.username];
    const expectedToken = await unlockToken(user.username);
    if (cookie !== expectedToken) {
      return res.set('Cache-Control', 'no-cache').send(passwordGateHtml(user.username));
    }
  }

  const views = isPreview ? (user.views || 0) : await store.incrementViews(user.username);
  if (!isPreview) await analytics.record(user.username, req.get('referer'), req.hostname);

  const cfg = publicConfig(user.config); // strips password hash
  cfg.views = views;
  cfg.premium = !!user.premium;
  cfg.username = user.username; // used by the client for link-click tracking
  cfg.profile = cfg.profile || {};
  cfg.profile.badges = await getProfileBadges(user);
  if (!user.premium) { // defensive re-gate
    cfg.customLinks = [];
    cfg.removeBranding = false;
    cfg.customCss = '';
    if (cfg.profile) cfg.profile.banner = '';
    if (cfg.theme && cfg.theme.effects) cfg.theme.effects.cursor = '';
    if (cfg.theme && cfg.theme.background && cfg.theme.background.type === 'video') cfg.theme.background.type = 'image';
  }

  try {
    res.set('Cache-Control', 'no-cache');
    const meta = buildMeta(cfg, user.username, originOf(req));
    res.send(renderBio(cfg, meta));
  } catch (e) {
    console.error('Bio render error:', e);
    res.status(500).send('Could not render this page.');
  }
}

function bioNotFound(res, username) {
  res.status(404).send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Not found · Lumenbio</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#000;color:#fff;font-family:'Poppins',system-ui,sans-serif;text-align:center}
.box{padding:2rem}.box h1{font-size:3rem;margin:0 0 .5rem}.box p{color:#9ca3af}a{color:#8b5cf6;text-decoration:none}</style></head>
<body><div class="box"><h1>404</h1><p><strong>${String(username).replace(/[<>&]/g, '')}</strong> doesn't have a Lumenbio page (yet).</p>
<p><a href="/">← Back to Lumenbio</a></p></div></body></html>`);
}

app.get('/u/:username', async (req, res) => {
  try {
    const user = await store.findByUsername(req.params.username);
    if (!user) return bioNotFound(res, req.params.username);
    await serveBio(user, req, res);
  } catch (e) {
    console.error('Route error:', e);
    res.status(500).send('Internal Server Error');
  }
});

// Friendly alias: /@username -> /u/username
app.get('/@:username', (req, res) => res.redirect(302, '/u/' + req.params.username));

// Unknown routes fall back to the landing page (SPA-style).
app.get('*', sendPage('landing'));

app.listen(PORT, async () => {
  console.log(`\nLumenbio running on http://localhost:${PORT}`);
  try {
    console.log(`Users: ${await store.count()}/${store.MAX_USERS}\n`);
  } catch (e) {
    console.log(`Failed to fetch user count from KV.\n`);
  }
});
