/**
 * Admin API — list users, grant/revoke premium, manage redeem codes.
 * Admin = username in ADMIN_USERS env, or the first registered account.
 */
const express = require('express');
const store = require('./store');
const codes = require('./codes');
const { authRequired } = require('./auth');

const router = express.Router();

async function adminRequired(req, res, next) {
  const u = await store.findById(req.user.id);
  if (!u || !(await store.isAdmin(u))) return res.status(403).json({ error: 'Admins only.' });
  req.adminUser = u;
  next();
}

router.use(authRequired, adminRequired);

router.get('/users', async (_req, res) => {
  const allUsers = await store.all();
  const usersWithAdmin = await Promise.all(allUsers.map(async u => ({
    username: u.username,
    email: u.email,
    premium: !!u.premium,
    admin: await store.isAdmin(u),
    views: u.views || 0,
    createdAt: u.createdAt
  })));
  res.json({ users: usersWithAdmin });
});

router.post('/premium', async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const premium = !!req.body.premium;
  const target = await store.findByUsername(username);
  if (!target) return res.status(404).json({ error: 'User not found.' });
  await store.update(target.id, { premium });
  res.json({ success: true, username, premium });
});

router.get('/codes', async (_req, res) => res.json({ codes: await codes.list() }));

router.post('/codes', async (req, res) => res.json({ success: true, codes: await codes.generate(req.body.count) }));

module.exports = { router };
