/**
 * Admin API — list users, grant/revoke premium, manage redeem codes.
 * Admin = username in ADMIN_USERS env, or the first registered account.
 */
const express = require('express');
const store = require('./store');
const codes = require('./codes');
const { authRequired } = require('./auth');

const router = express.Router();

function adminRequired(req, res, next) {
  const u = store.findById(req.user.id);
  if (!u || !store.isAdmin(u)) return res.status(403).json({ error: 'Admins only.' });
  req.adminUser = u;
  next();
}

router.use(authRequired, adminRequired);

router.get('/users', (_req, res) => {
  res.json({
    users: store.all().map(u => ({
      username: u.username,
      email: u.email,
      premium: !!u.premium,
      admin: store.isAdmin(u),
      views: u.views || 0,
      createdAt: u.createdAt
    }))
  });
});

router.post('/premium', (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const premium = !!req.body.premium;
  const target = store.findByUsername(username);
  if (!target) return res.status(404).json({ error: 'User not found.' });
  store.update(target.id, { premium });
  res.json({ success: true, username, premium });
});

router.get('/codes', (_req, res) => res.json({ codes: codes.list() }));

router.post('/codes', (req, res) => res.json({ success: true, codes: codes.generate(req.body.count) }));

module.exports = { router };
