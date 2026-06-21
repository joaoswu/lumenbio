const crypto = require('crypto');
const { Redis } = require('@upstash/redis');
const kv = Redis.fromEnv();

let SECRET = process.env.JWT_SECRET;

async function getSecret() {
  if (SECRET) return SECRET;
  try {
    const val = await kv.get('jwt-secret');
    if (val) {
      SECRET = val;
      return SECRET;
    }
    SECRET = crypto.randomBytes(32).toString('hex');
    await kv.set('jwt-secret', SECRET);
    return SECRET;
  } catch (e) {
    console.error('Failed to get/set JWT secret from KV, using ephemeral:', e);
    SECRET = crypto.randomBytes(32).toString('hex');
    return SECRET;
  }
}

module.exports = {
  getSecret,
  unlockToken: async (username) => {
    const s = await getSecret();
    return crypto.createHmac('sha256', s).update('unlock:' + String(username).toLowerCase()).digest('hex');
  }
};
