/**
 * Per-user bio analytics — daily view counts + top referrers (data/analytics.json).
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'analytics.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch (e) { return {}; }
}
let db = load();
let dirty = false;
function scheduleSave() {
  if (dirty) return;
  dirty = true;
  setTimeout(() => {
    try { fs.writeFileSync(FILE, JSON.stringify(db), 'utf8'); } catch (e) {}
    dirty = false;
  }, 1500);
}

const today = () => new Date().toISOString().slice(0, 10);

function refDomain(referer) {
  if (!referer) return 'direct';
  try { return new URL(referer).hostname.replace(/^www\./, '') || 'direct'; }
  catch (e) { return 'direct'; }
}

module.exports = {
  record(username, referer, selfHost) {
    if (!username) return;
    const u = String(username).toLowerCase();
    const entry = db[u] || (db[u] = { days: {}, referrers: {} });
    const d = today();
    entry.days[d] = (entry.days[d] || 0) + 1;

    // Prune to last 60 days
    const keys = Object.keys(entry.days).sort();
    while (keys.length > 60) delete entry.days[keys.shift()];

    let dom = refDomain(referer);
    if (selfHost && dom === String(selfHost).toLowerCase()) dom = 'direct'; // ignore internal nav
    entry.referrers[dom] = (entry.referrers[dom] || 0) + 1;
    scheduleSave();
  },

  get(username) {
    const u = String(username || '').toLowerCase();
    const entry = db[u] || { days: {}, referrers: {} };

    // last 30 days (oldest -> newest), zero-filled
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const dt = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      days.push({ date: dt, count: entry.days[dt] || 0 });
    }
    const referrers = Object.entries(entry.referrers)
      .sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([domain, count]) => ({ domain, count }));
    const total = Object.values(entry.days).reduce((a, b) => a + b, 0);
    return { days, referrers, total };
  }
};
