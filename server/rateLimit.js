/**
 * Tiny in-memory rate limiter (no deps). Keyed by client IP.
 * Good enough for a single-instance app; swap for a store-backed limiter if scaled.
 */
module.exports = function rateLimit({ windowMs = 15 * 60 * 1000, max = 30, message = 'Too many requests — please slow down and try again shortly.' } = {}) {
  const hits = new Map();

  return function (req, res, next) {
    const now = Date.now();
    const ip = req.ip || (req.connection && req.connection.remoteAddress) || 'unknown';

    // Occasional prune so the map can't grow forever.
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
    }

    let entry = hits.get(ip);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(ip, entry);
    }
    entry.count++;

    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ error: message });
    }
    next();
  };
};
