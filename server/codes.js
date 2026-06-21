/**
 * Premium redeem codes — single-use, file-backed (data/codes.json).
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'codes.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch (e) { return { codes: [] }; }
}

let db = load();

function save() {
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, FILE);
}

// Seed a few single-use codes the first time.
if (!db.codes.length) {
  const seed = (process.env.PREMIUM_CODES || 'LUMEN-PREMIUM,FOUNDER,VIP2026')
    .split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
  db.codes = seed.map(code => ({ code, used: false, usedBy: null, usedAt: null, createdAt: new Date().toISOString() }));
  save();
}

function randomCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  const blk = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `LUMEN-${blk()}-${blk()}`;
}

module.exports = {
  list: () => db.codes.slice().reverse(),
  redeem(codeStr, user) {
    const code = String(codeStr || '').trim().toUpperCase();
    if (!code) return { ok: false, error: 'Enter a code.' };
    const entry = db.codes.find(c => c.code === code);
    if (!entry) return { ok: false, error: 'That code is invalid.' };
    if (entry.used) return { ok: false, error: 'That code has already been redeemed.' };
    entry.used = true;
    entry.usedBy = user.username;
    entry.usedAt = new Date().toISOString();
    save();
    return { ok: true };
  },
  generate(n) {
    const count = Math.max(1, Math.min(50, parseInt(n) || 1));
    const out = [];
    for (let i = 0; i < count; i++) {
      let code;
      do { code = randomCode(); } while (db.codes.some(c => c.code === code));
      const entry = { code, used: false, usedBy: null, usedAt: null, createdAt: new Date().toISOString() };
      db.codes.push(entry);
      out.push(entry);
    }
    save();
    return out;
  }
};
