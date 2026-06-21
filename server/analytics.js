const { Redis } = require('@upstash/redis');
const kv = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });

async function load() {
  try { return (await kv.get('lumen_analytics')) || {}; }
  catch (e) { return {}; }
}

async function save(db) {
  try { await kv.set('lumen_analytics', db); } catch (e) {}
}

const today = () => new Date().toISOString().slice(0, 10);

function refDomain(referer) {
  if (!referer) return 'direct';
  try { return new URL(referer).hostname.replace(/^www\./, '') || 'direct'; }
  catch (e) { return 'direct'; }
}

module.exports = {
  async record(username, referer, selfHost) {
    if (!username) return;
    const u = String(username).toLowerCase();
    const db = await load();
    const entry = db[u] || (db[u] = { days: {}, referrers: {} });
    const d = today();
    entry.days[d] = (entry.days[d] || 0) + 1;

    // Prune to last 60 days
    const keys = Object.keys(entry.days).sort();
    while (keys.length > 60) delete entry.days[keys.shift()];

    let dom = refDomain(referer);
    if (selfHost && dom === String(selfHost).toLowerCase()) dom = 'direct'; // ignore internal nav
    entry.referrers[dom] = (entry.referrers[dom] || 0) + 1;
    
    await save(db);
  },

  async get(username) {
    const u = String(username || '').toLowerCase();
    const db = await load();
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
