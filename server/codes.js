const { kv } = require('@vercel/kv');

async function load() {
  try { return (await kv.get('lumen_codes')) || { codes: [] }; }
  catch (e) { return { codes: [] }; }
}

async function save(db) {
  try { await kv.set('lumen_codes', db); } catch(e) {}
}

async function checkSeed() {
  const db = await load();
  if (!db.codes.length) {
    const seed = (process.env.PREMIUM_CODES || 'LUMEN-PREMIUM,FOUNDER,VIP2026')
      .split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
    db.codes = seed.map(code => ({ code, used: false, usedBy: null, usedAt: null, createdAt: new Date().toISOString() }));
    await save(db);
  }
}

function randomCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  const blk = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `LUMEN-${blk()}-${blk()}`;
}

module.exports = {
  async list() { 
    await checkSeed();
    const db = await load(); 
    return db.codes.slice().reverse(); 
  },
  async redeem(codeStr, user) {
    await checkSeed();
    const db = await load();
    const code = String(codeStr || '').trim().toUpperCase();
    if (!code) return { ok: false, error: 'Enter a code.' };
    const entry = db.codes.find(c => c.code === code);
    if (!entry) return { ok: false, error: 'That code is invalid.' };
    if (entry.used) return { ok: false, error: 'That code has already been redeemed.' };
    entry.used = true;
    entry.usedBy = user.username;
    entry.usedAt = new Date().toISOString();
    await save(db);
    return { ok: true };
  },
  async generate(n) {
    await checkSeed();
    const db = await load();
    const count = Math.max(1, Math.min(50, parseInt(n) || 1));
    const out = [];
    for (let i = 0; i < count; i++) {
      let code;
      do { code = randomCode(); } while (db.codes.some(c => c.code === code));
      const entry = { code, used: false, usedBy: null, usedAt: null, createdAt: new Date().toISOString() };
      db.codes.push(entry);
      out.push(entry);
    }
    await save(db);
    return out;
  }
};
