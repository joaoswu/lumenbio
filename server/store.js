/**
 * Lumenbio data store — file-backed JSON (data/users.json).
 * Synchronous + atomic writes; ample for the 1000-user cap.
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'users.json');
const MAX_USERS = 1000;
const ADMIN_USERS = (process.env.ADMIN_USERS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function load() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch (e) { return { users: [] }; }
}

let db = load();

function save() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

const lc = (v) => String(v || '').toLowerCase();

module.exports = {
  MAX_USERS,
  count: () => db.users.length,
  isFull: () => db.users.length >= MAX_USERS,
  remaining: () => Math.max(0, MAX_USERS - db.users.length),
  all: () => db.users,
  findByDomain: (host) => {
    const h = lc(host);
    if (!h) return undefined;
    return db.users.find(x => x.premium && x.config && lc(x.config.customDomain) === h);
  },
  findByUsername: (u) => db.users.find(x => x.username === lc(u)),
  findByEmail: (e) => db.users.find(x => x.email === lc(e)),
  findById: (id) => db.users.find(x => x.id === id),
  isAdmin(u) {
    if (!u) return false;
    if (ADMIN_USERS.includes(lc(u.username))) return true;
    // The first registered account is the instance owner / admin.
    return db.users.length > 0 && db.users[0].id === u.id;
  },
  create(user) { db.users.push(user); save(); return user; },
  update(id, patch) {
    const u = db.users.find(x => x.id === id);
    if (!u) return null;
    Object.assign(u, patch);
    save();
    return u;
  },
  setConfig(id, config) {
    const u = db.users.find(x => x.id === id);
    if (!u) return null;
    u.config = config;
    u.updatedAt = new Date().toISOString();
    save();
    return u;
  },
  incrementViews(username) {
    const u = db.users.find(x => x.username === lc(username));
    if (!u) return 0;
    u.views = (u.views || 0) + 1;
    save();
    return u.views;
  }
};
