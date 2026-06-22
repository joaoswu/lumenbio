/**
 * Lumenbio authentication — signup / login / logout / me.
 * bcrypt password hashing + JWT in an httpOnly cookie.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const store = require('./store');
const codes = require('./codes');
const defaultConfig = require('./defaultConfig');
const rateLimit = require('./rateLimit');
const mailer = require('./email');
const PasswordStrength = require('../public/shared/password-strength.js');
const { Redis } = require('@upstash/redis');

const kv = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
const router = express.Router();

const signupLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, message: 'Too many sign-up attempts. Try again later.' });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: 'Too many login attempts. Please wait a few minutes.' });
const redeemLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 15, message: 'Too many code attempts. Try again later.' });
const forgotLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 8, message: 'Too many reset requests. Try again later.' });
const resetLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, message: 'Too many attempts. Try again later.' });

const PASSWORD_TOO_WEAK = 'Password is too weak — use 8+ characters with a mix of letters, numbers and symbols.';
function passwordOk(pw) {
  return pw.length >= 8 && PasswordStrength.score(pw).score >= 2;
}
function originOf(req) {
  return (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
}

// Persisted secret so sessions survive restarts (shared with the unlock token).
const { getSecret } = require('./secret');

const COOKIE = 'lumen_token';
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const RESERVED = ['admin', 'login', 'signup', 'dashboard', 'api', 'u', 'health', 'shared', 'css', 'js', 'assets', 'static', 'lumenbio', 'about', 'settings', 'logout'];

async function sign(user) {
  const secret = await getSecret();
  return jwt.sign({ id: user.id, username: user.username }, secret, { expiresIn: '30d' });
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000
  });
}

async function authOptional(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE];
  if (token) { 
    try { 
      const secret = await getSecret();
      req.user = jwt.verify(token, secret); 
    } catch (e) { /* ignore */ } 
  }
  next();
}

async function authRequired(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try { 
    const secret = await getSecret();
    req.user = jwt.verify(token, secret); 
    next(); 
  }
  catch (e) { res.status(401).json({ error: 'Session expired, please log in again.' }); }
}

router.post('/signup', signupLimiter, async (req, res) => {
  try {
    const username = String(req.body.username || '').trim().toLowerCase();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!USERNAME_RE.test(username)) {
      return res.status(400).json({ error: 'Username must be 3–20 characters: lowercase letters, numbers or underscore.' });
    }
    if (RESERVED.includes(username)) {
      return res.status(400).json({ error: 'That username is reserved.' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    const strength = PasswordStrength.score(password);
    if (password.length < 8 || strength.score < 2) {
      return res.status(400).json({ error: 'Password is too weak — use 8+ characters with a mix of letters, numbers and symbols.' });
    }
    if (await store.isFull()) {
      return res.status(403).json({ error: 'Lumenbio is at capacity right now. Please check back soon!' });
    }
    if (await store.findByUsername(username)) {
      return res.status(409).json({ error: 'That username is already taken.' });
    }
    if (await store.findByEmail(email)) {
      return res.status(409).json({ error: 'That email is already registered.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await store.create({
      id: crypto.randomUUID(),
      username,
      email,
      passwordHash,
      createdAt: new Date().toISOString(),
      views: 0,
      premium: false,
      config: defaultConfig(username)
    });

    setAuthCookie(res, await sign(user));
    res.json({ success: true, username: user.username });
  } catch (e) {
    console.error('Signup error:', e);
    res.status(500).json({ error: 'Something went wrong creating your account.' });
  }
});

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const identifier = String(req.body.identifier || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    let user = await store.findByUsername(identifier);
    if (!user) user = await store.findByEmail(identifier);
    if (!user) return res.status(401).json({ error: 'Invalid username/email or password.' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid username/email or password.' });

    setAuthCookie(res, await sign(user));
    res.json({ success: true, username: user.username });
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ error: 'Something went wrong logging in.' });
  }
});

router.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE);
  res.json({ success: true });
});

router.get('/account', authRequired, async (req, res) => {
  const u = await store.findById(req.user.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  res.json({
    username: u.username,
    email: u.email,
    createdAt: u.createdAt,
    views: u.views || 0,
    premium: !!u.premium,
    token: (req.cookies && req.cookies[COOKIE]) || ''
  });
});

// ---- Password reset (forgot / reset) ----
router.post('/forgot', forgotLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  // Always respond identically so we never leak which emails are registered.
  const generic = { success: true };
  if (!EMAIL_RE.test(email)) return res.json(generic);
  try {
    const user = await store.findByEmail(email);
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      await kv.set('reset:' + token, user.id, { ex: 3600 }); // 1 hour
      const link = `${originOf(req)}/reset?token=${token}`;
      const msg = mailer.resetEmail(link);
      await mailer.send({ to: user.email, subject: msg.subject, html: msg.html, text: msg.text });
    }
  } catch (e) {
    console.error('Forgot-password error:', e);
  }
  res.json(generic);
});

router.post('/reset', resetLimiter, async (req, res) => {
  const token = String(req.body.token || '').trim();
  const password = String(req.body.password || '');
  if (!token) return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
  if (!passwordOk(password)) return res.status(400).json({ error: PASSWORD_TOO_WEAK });
  try {
    const userId = await kv.get('reset:' + token);
    if (!userId) return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
    const user = await store.findById(String(userId));
    if (!user) return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
    await store.update(user.id, { passwordHash: await bcrypt.hash(password, 10) });
    await kv.del('reset:' + token);
    res.json({ success: true });
  } catch (e) {
    console.error('Reset-password error:', e);
    res.status(500).json({ error: 'Something went wrong resetting your password.' });
  }
});

// ---- Account management (signed-in) ----
router.post('/change-password', authRequired, async (req, res) => {
  const u = await store.findById(req.user.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const current = String(req.body.currentPassword || '');
  const next = String(req.body.newPassword || '');
  if (!(await bcrypt.compare(current, u.passwordHash))) {
    return res.status(400).json({ error: 'Current password is incorrect.' });
  }
  if (!passwordOk(next)) return res.status(400).json({ error: PASSWORD_TOO_WEAK });
  await store.update(u.id, { passwordHash: await bcrypt.hash(next, 10) });
  res.json({ success: true });
});

router.post('/change-email', authRequired, async (req, res) => {
  const u = await store.findById(req.user.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (!(await bcrypt.compare(password, u.passwordHash))) {
    return res.status(400).json({ error: 'Password is incorrect.' });
  }
  const existing = await store.findByEmail(email);
  if (existing && existing.id !== u.id) return res.status(409).json({ error: 'That email is already registered.' });
  await store.update(u.id, { email });
  res.json({ success: true, email });
});

router.post('/delete-account', authRequired, async (req, res) => {
  const u = await store.findById(req.user.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const password = String(req.body.password || '');
  if (!(await bcrypt.compare(password, u.passwordHash))) {
    return res.status(400).json({ error: 'Password is incorrect.' });
  }
  await store.remove(u.id);
  res.clearCookie(COOKIE);
  res.json({ success: true });
});

router.post('/redeem', redeemLimiter, authRequired, async (req, res) => {
  const u = await store.findById(req.user.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const code = String(req.body.code || '').trim().toLowerCase();
  if (!code) return res.status(400).json({ error: 'Enter a code.' });
  if (u.premium) return res.json({ success: true, premium: true, already: true });
  const result = await codes.redeem(code, u);
  if (!result.ok) return res.status(400).json({ error: result.error });
  await store.update(u.id, { premium: true });
  res.json({ success: true, premium: true });
});

router.get('/me', authOptional, async (req, res) => {
  if (!req.user) return res.json({ user: null, remaining: await store.remaining() });
  const u = await store.findById(req.user.id);
  if (!u) return res.json({ user: null, remaining: await store.remaining() });
  res.json({
    user: { username: u.username, email: u.email, views: u.views || 0, premium: !!u.premium, isAdmin: await store.isAdmin(u) },
    remaining: await store.remaining()
  });
});

module.exports = { router, authRequired, authOptional };
