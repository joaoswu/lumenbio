const { Redis } = require('@upstash/redis');
const kv = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
const MAX_USERS = 1000;
const ADMIN_USERS = (process.env.ADMIN_USERS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

async function load() {
  try {
    const data = await kv.get('lumen_users');
    return data || { users: [] };
  } catch (e) {
    console.error('KV load error:', e);
    return { users: [] };
  }
}

async function save(db) {
  try {
    await kv.set('lumen_users', db);
  } catch (e) {
    console.error('KV save error:', e);
  }
}

const lc = (v) => String(v || '').toLowerCase();

module.exports = {
  MAX_USERS,
  async count() { const db = await load(); return db.users.length; },
  async isFull() { const db = await load(); return db.users.length >= MAX_USERS; },
  async remaining() { const db = await load(); return Math.max(0, MAX_USERS - db.users.length); },
  async all() { const db = await load(); return db.users; },
  async findByDomain(host) {
    const h = lc(host);
    if (!h) return undefined;
    const db = await load();
    return db.users.find(x => x.premium && x.config && lc(x.config.customDomain) === h);
  },
  async findByUsername(u) { const db = await load(); return db.users.find(x => x.username === lc(u)); },
  async findByEmail(e) { const db = await load(); return db.users.find(x => x.email === lc(e)); },
  async findById(id) { const db = await load(); return db.users.find(x => x.id === id); },
  async isAdmin(u) {
    if (!u) return false;
    if (ADMIN_USERS.includes(lc(u.username))) return true;
    const db = await load();
    return db.users.length > 0 && db.users[0].id === u.id;
  },
  async create(user) { 
    const db = await load(); 
    db.users.push(user); 
    await save(db); 
    return user; 
  },
  async update(id, patch) {
    const db = await load();
    const u = db.users.find(x => x.id === id);
    if (!u) return null;
    Object.assign(u, patch);
    await save(db);
    return u;
  },
  async setConfig(id, config) {
    const db = await load();
    const u = db.users.find(x => x.id === id);
    if (!u) return null;
    u.config = config;
    u.updatedAt = new Date().toISOString();
    await save(db);
    return u;
  },
  async remove(id) {
    const db = await load();
    const i = db.users.findIndex(x => x.id === id);
    if (i === -1) return false;
    db.users.splice(i, 1);
    await save(db);
    return true;
  },
  async incrementViews(username) {
    const db = await load();
    const u = db.users.find(x => x.username === lc(username));
    if (!u) return 0;
    u.views = (u.views || 0) + 1;
    await save(db);
    return u.views;
  },
  async getGuestbookMessages(username) {
    try {
      const messages = await kv.get(`guestbook:${lc(username)}`);
      return messages || [];
    } catch (e) {
      console.error('KV getGuestbookMessages error:', e);
      return [];
    }
  },
  async addGuestbookMessage(username, msg) {
    try {
      const key = `guestbook:${lc(username)}`;
      const messages = (await kv.get(key)) || [];
      messages.unshift(msg);
      if (messages.length > 100) {
        messages.splice(100);
      }
      await kv.set(key, messages);
      return messages;
    } catch (e) {
      console.error('KV addGuestbookMessage error:', e);
      return [];
    }
  },
  async deleteGuestbookMessage(username, id) {
    try {
      const key = `guestbook:${lc(username)}`;
      const messages = (await kv.get(key)) || [];
      const i = messages.findIndex(m => m.id === id);
      if (i === -1) return false;
      messages.splice(i, 1);
      await kv.set(key, messages);
      return true;
    } catch (e) {
      console.error('KV deleteGuestbookMessage error:', e);
      return false;
    }
  }
};
