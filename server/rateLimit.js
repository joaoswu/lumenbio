/**
 * Rate limiter backed by Upstash Redis.
 *
 * An in-memory map does NOT work on Vercel: state is lost on cold starts and
 * isn't shared across concurrent serverless instances, so limits never really
 * hold. This keys on the real client IP (x-forwarded-for) and counts in Redis
 * with a TTL. Fails OPEN if Redis is unavailable so a KV blip can't lock
 * everyone out. Pass a unique `name` per limiter so they don't share a counter.
 */
const { Redis } = require('@upstash/redis');
const kv = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.ip || (req.connection && req.connection.remoteAddress) || 'unknown';
}

module.exports = function rateLimit({
  windowMs = 15 * 60 * 1000,
  max = 30,
  message = 'Too many requests — please slow down and try again shortly.',
  name = 'rl'
} = {}) {
  const windowSec = Math.max(1, Math.ceil(windowMs / 1000));
  return async function (req, res, next) {
    try {
      const key = `rl:${name}:${clientIp(req)}`;
      const count = await kv.incr(key);
      if (count === 1) await kv.expire(key, windowSec);
      if (count > max) {
        let ttl = windowSec;
        try {
          const t = await kv.ttl(key);
          if (t > 0) ttl = t;
          else if (t === -1) await kv.expire(key, windowSec); // self-heal a key left without a TTL
        } catch (e) { /* use window */ }
        res.set('Retry-After', String(ttl));
        return res.status(429).json({ error: message });
      }
    } catch (e) {
      // Redis unavailable — fail open rather than block legitimate users.
    }
    next();
  };
};
