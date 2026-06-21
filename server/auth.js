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
const PasswordStrength = require('../public/shared/password-strength.js');

const router = express.Router();

const signupLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, message: 'Too many sign-up attempts. Try again later.' });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: 'Too many login attempts. Please wait a few minutes.' });
const redeemLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 15, message: 'Too many code attempts. Try again later.' });

// Persisted secret so sessions survive restarts (shared with the unlock token).
const JWT_SECRET = require('./secret').SECRET;

const COOKIE = 'lumen_token';
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const RESERVED = ['admin', 'login', 'signup', 'dashboard', 'api', 'u', 'health', 'shared', 'css', 'js', 'assets', 'static', 'lumenbio', 'about', 'settings', 'logout'];

function sign(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000
  });
}

function authOptional(req, _res, next) {
  const token = req.cookies && req.cookies[COOKIE];
  if (token) { try { req.user = jwt.verify(token, JWT_SECRET); } catch (e) { /* ignore */ } }
  next();
}

function authRequired(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
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
    if (store.isFull()) {
      return res.status(403).json({ error: 'Lumenbio is at capacity (1000 users) right now. Please check back soon!' });
    }
    if (store.findByUsername(username)) {
      return res.status(409).json({ error: 'That username is already taken.' });
    }
    if (store.findByEmail(email)) {
      return res.status(409).json({ error: 'That email is already registered.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = store.create({
      id: crypto.randomUUID(),
      username,
      email,
      passwordHash,
      createdAt: new Date().toISOString(),
      views: 0,
      premium: false,
      config: defaultConfig(username)
    });

    setAuthCookie(res, sign(user));
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

    const user = store.findByUsername(identifier) || store.findByEmail(identifier);
    if (!user) return res.status(401).json({ error: 'Invalid username/email or password.' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid username/email or password.' });

    setAuthCookie(res, sign(user));
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

router.get('/account', authRequired, (req, res) => {
  const u = store.findById(req.user.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  res.json({
    username: u.username,
    email: u.email,
    createdAt: u.createdAt,
    views: u.views || 0,
    premium: !!u.premium,
    passwordHash: u.passwordHash,
    token: (req.cookies && req.cookies[COOKIE]) || ''
  });
});

router.post('/redeem', redeemLimiter, authRequired, (req, res) => {
  const u = store.findById(req.user.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const code = String(req.body.code || '').trim().toLowerCase();
  if (!code) return res.status(400).json({ error: 'Enter a code.' });
  if (u.premium) return res.json({ success: true, premium: true, already: true });
  const result = codes.redeem(code, u);
  if (!result.ok) return res.status(400).json({ error: result.error });
  store.update(u.id, { premium: true });
  res.json({ success: true, premium: true });
});

router.get('/me', authOptional, (req, res) => {
  if (!req.user) return res.json({ user: null, remaining: store.remaining() });
  const u = store.findById(req.user.id);
  if (!u) return res.json({ user: null, remaining: store.remaining() });
  res.json({
    user: { username: u.username, email: u.email, views: u.views || 0, premium: !!u.premium, isAdmin: store.isAdmin(u) },
    remaining: store.remaining()
  });
});

module.exports = { router, authRequired, authOptional };
